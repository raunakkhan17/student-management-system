import { Prisma, type AttendanceSessionStatus, type AttendanceStatus } from '@prisma/client';
import { prisma } from '@/config/prisma';
import type { AuthenticatedUser } from '@/types/auth';
import type { ListQueryOptions, PaginatedData } from '@/types/api';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '@/utils/api-error';
import { buildPaginationMeta } from '@/utils/pagination';
import type {
  AttendanceRecordInput,
  MarkAttendanceInput,
} from '@/validators/attendance.validator';

const sessionInclude = {
  class: { select: { id: true, name: true, code: true } },
  section: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true, code: true } },
  period: { select: { id: true, name: true, startTime: true, endTime: true } },
  markedBy: { select: { id: true, firstName: true, lastName: true } },
  records: {
    include: {
      student: {
        select: {
          id: true,
          admissionNumber: true,
          rollNumber: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
    },
  },
} satisfies Prisma.AttendanceSessionInclude;

export type SessionWithRecords = Prisma.AttendanceSessionGetPayload<{
  include: typeof sessionInclude;
}>;

/** Statuses that count towards "present" when computing percentages. */
const PRESENT_STATUSES: AttendanceStatus[] = ['PRESENT', 'LATE'];

/**
 * Verifies the caller may mark or edit attendance for this section.
 *
 * Teachers are limited to sections they own as class teacher or teach through a
 * subject offering; admins are unrestricted.
 */
async function assertCanMarkSection(
  user: AuthenticatedUser,
  classId: string,
  sectionId: string,
  subjectId: string | null,
): Promise<void> {
  if (user.role !== 'TEACHER') return;
  if (!user.teacherId) {
    throw new ForbiddenError('Your account is not linked to a teacher record');
  }

  const [isClassTeacher, hasOffering] = await Promise.all([
    prisma.section.count({
      where: {
        id: sectionId,
        OR: [{ classTeacherId: user.teacherId }, { class: { classTeacherId: user.teacherId } }],
      },
    }),
    prisma.classSubject.count({
      where: {
        teacherId: user.teacherId,
        classId,
        OR: [{ sectionId }, { sectionId: null }],
        ...(subjectId ? { subjectId } : {}),
      },
    }),
  ]);

  if (isClassTeacher + hasOffering === 0) {
    throw new ForbiddenError('You do not teach this section');
  }
}

/** The attendance rules in force for the current academic year. */
async function getAttendanceRules() {
  const rule = await prisma.attendanceRule.findFirst({
    where: { academicYear: { isCurrent: true, deletedAt: null } },
  });

  // Fall back to the schema defaults if no year-specific rule exists yet.
  return (
    rule ?? {
      minAttendancePercent: new Prisma.Decimal(75),
      lateThresholdMinutes: 15,
      halfDayThresholdMinutes: 120,
      autoLockAfterHours: 24,
      allowBackdatedDays: 7,
      countLateAsPresent: true,
    }
  );
}

/** Roster plus any marks already recorded, so the sheet opens pre-filled. */
export async function getAttendanceSheet(
  user: AuthenticatedUser,
  input: { classId: string; sectionId: string; subjectId?: string; periodId?: string; date: Date },
) {
  await assertCanMarkSection(user, input.classId, input.sectionId, input.subjectId ?? null);

  const [students, existing, holiday, rules] = await Promise.all([
    prisma.student.findMany({
      where: {
        classId: input.classId,
        sectionId: input.sectionId,
        deletedAt: null,
        status: { in: ['ACTIVE', 'SUSPENDED'] },
      },
      select: {
        id: true,
        admissionNumber: true,
        rollNumber: true,
        photoId: true,
        user: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ rollNumber: 'asc' }, { admissionNumber: 'asc' }],
    }),
    findSession({
      classId: input.classId,
      sectionId: input.sectionId,
      subjectId: input.subjectId ?? null,
      periodId: input.periodId ?? null,
      date: input.date,
    }),
    prisma.holiday.findFirst({
      where: {
        date: { lte: input.date },
        OR: [{ endDate: null, date: input.date }, { endDate: { gte: input.date } }],
      },
      select: { name: true, date: true, endDate: true },
    }),
    getAttendanceRules(),
  ]);

  const marksByStudent = new Map(
    existing?.records.map((record) => [record.studentId, record]) ?? [],
  );

  return {
    session: existing
      ? {
          id: existing.id,
          status: existing.status,
          submittedAt: existing.submittedAt,
          lockedAt: existing.lockedAt,
          remarks: existing.remarks,
          markedBy: existing.markedBy,
        }
      : null,
    holiday,
    rules: {
      lateThresholdMinutes: rules.lateThresholdMinutes,
      halfDayThresholdMinutes: rules.halfDayThresholdMinutes,
      allowBackdatedDays: rules.allowBackdatedDays,
    },
    students: students.map((student) => {
      const mark = marksByStudent.get(student.id);
      return {
        studentId: student.id,
        admissionNumber: student.admissionNumber,
        rollNumber: student.rollNumber,
        photoId: student.photoId,
        firstName: student.user.firstName,
        lastName: student.user.lastName,
        status: mark?.status ?? null,
        minutesLate: mark?.minutesLate ?? null,
        remarks: mark?.remarks ?? null,
      };
    }),
  };
}

/**
 * Looks up a session by its natural key.
 *
 * Written as an explicit query rather than `findUnique` because the composite
 * unique includes nullable columns, and Postgres treats NULLs as distinct — so
 * the index alone would not find (or prevent) a NULL-valued duplicate.
 */
async function findSession(key: {
  classId: string;
  sectionId: string;
  subjectId: string | null;
  periodId: string | null;
  date: Date;
}) {
  return prisma.attendanceSession.findFirst({
    where: {
      classId: key.classId,
      sectionId: key.sectionId,
      subjectId: key.subjectId,
      periodId: key.periodId,
      date: key.date,
    },
    include: sessionInclude,
  });
}

/** Creates or updates a session and its records in one transaction. */
export async function markAttendance(
  user: AuthenticatedUser,
  input: MarkAttendanceInput,
): Promise<SessionWithRecords> {
  await assertCanMarkSection(user, input.classId, input.sectionId, input.subjectId ?? null);

  const rules = await getAttendanceRules();

  // Backdating beyond the configured window needs an administrator.
  const daysAgo = Math.floor((Date.now() - input.date.getTime()) / 86_400_000);
  if (daysAgo > rules.allowBackdatedDays && user.role === 'TEACHER') {
    throw new ForbiddenError(
      `Attendance can only be marked up to ${rules.allowBackdatedDays} day(s) back. Ask an administrator to record it.`,
    );
  }

  if (input.date.getTime() > Date.now()) {
    throw new BadRequestError('Attendance cannot be marked for a future date', [
      { field: 'date', message: 'Choose today or an earlier date' },
    ]);
  }

  await assertStudentsBelongToSection(
    input.sectionId,
    input.records.map((record) => record.studentId),
  );

  const existing = await findSession({
    classId: input.classId,
    sectionId: input.sectionId,
    subjectId: input.subjectId ?? null,
    periodId: input.periodId ?? null,
    date: input.date,
  });

  if (existing?.status === 'LOCKED' && user.role === 'TEACHER') {
    throw new ConflictError('This roll has been locked. Ask an administrator to reopen it.');
  }

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const sessionId = existing
      ? (
          await tx.attendanceSession.update({
            where: { id: existing.id },
            data: {
              markedById: user.id,
              remarks: input.remarks ?? null,
              ...(input.submit
                ? { status: 'SUBMITTED' as AttendanceSessionStatus, submittedAt: now }
                : {}),
            },
          })
        ).id
      : (
          await tx.attendanceSession.create({
            data: {
              classId: input.classId,
              sectionId: input.sectionId,
              subjectId: input.subjectId ?? null,
              periodId: input.periodId ?? null,
              date: input.date,
              markedById: user.id,
              remarks: input.remarks ?? null,
              status: input.submit ? 'SUBMITTED' : 'DRAFT',
              submittedAt: input.submit ? now : null,
            },
          })
        ).id;

    // Upsert each mark so re-submitting a partially filled sheet is safe.
    for (const record of input.records) {
      const derived = deriveStatus(record, rules.lateThresholdMinutes, rules.halfDayThresholdMinutes);

      await tx.attendanceRecord.upsert({
        where: { sessionId_studentId: { sessionId, studentId: record.studentId } },
        create: {
          sessionId,
          studentId: record.studentId,
          status: derived,
          minutesLate: record.minutesLate ?? null,
          remarks: record.remarks ?? null,
        },
        update: {
          status: derived,
          minutesLate: record.minutesLate ?? null,
          remarks: record.remarks ?? null,
        },
      });
    }

    return tx.attendanceSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: sessionInclude,
    });
  });
}

/**
 * Upgrades a PRESENT mark to LATE or HALF_DAY based on how late the student was,
 * so the configured thresholds are applied consistently server-side.
 */
function deriveStatus(
  record: AttendanceRecordInput,
  lateThresholdMinutes: number,
  halfDayThresholdMinutes: number,
): AttendanceStatus {
  if (record.status !== 'PRESENT' || record.minutesLate === undefined) {
    return record.status;
  }

  if (record.minutesLate >= halfDayThresholdMinutes) return 'HALF_DAY';
  if (record.minutesLate >= lateThresholdMinutes) return 'LATE';
  return 'PRESENT';
}

async function assertStudentsBelongToSection(
  sectionId: string,
  studentIds: string[],
): Promise<void> {
  const valid = await prisma.student.count({
    where: { id: { in: studentIds }, sectionId, deletedAt: null },
  });

  if (valid !== studentIds.length) {
    throw new BadRequestError('One or more students are not in this section', [
      { field: 'records', message: 'Roster and section do not match' },
    ]);
  }
}

/** Admin edit of a submitted or locked session. */
export async function updateAttendanceRecords(
  sessionId: string,
  records: AttendanceRecordInput[],
  remarks: string | undefined,
): Promise<SessionWithRecords> {
  const session = await prisma.attendanceSession.findUnique({
    where: { id: sessionId },
    select: { id: true, sectionId: true },
  });

  if (!session) throw new NotFoundError('Attendance session');

  await assertStudentsBelongToSection(
    session.sectionId,
    records.map((record) => record.studentId),
  );

  const rules = await getAttendanceRules();

  return prisma.$transaction(async (tx) => {
    for (const record of records) {
      await tx.attendanceRecord.upsert({
        where: { sessionId_studentId: { sessionId, studentId: record.studentId } },
        create: {
          sessionId,
          studentId: record.studentId,
          status: deriveStatus(record, rules.lateThresholdMinutes, rules.halfDayThresholdMinutes),
          minutesLate: record.minutesLate ?? null,
          remarks: record.remarks ?? null,
        },
        update: {
          status: deriveStatus(record, rules.lateThresholdMinutes, rules.halfDayThresholdMinutes),
          minutesLate: record.minutesLate ?? null,
          remarks: record.remarks ?? null,
        },
      });
    }

    if (remarks !== undefined) {
      await tx.attendanceSession.update({ where: { id: sessionId }, data: { remarks } });
    }

    return tx.attendanceSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: sessionInclude,
    });
  });
}

/** Locks a session so teachers can no longer change it. */
export async function lockSession(sessionId: string): Promise<SessionWithRecords> {
  const session = await prisma.attendanceSession.findUnique({
    where: { id: sessionId },
    select: { status: true },
  });

  if (!session) throw new NotFoundError('Attendance session');
  if (session.status === 'LOCKED') {
    throw new ConflictError('This session is already locked');
  }

  return prisma.attendanceSession.update({
    where: { id: sessionId },
    data: { status: 'LOCKED', lockedAt: new Date() },
    include: sessionInclude,
  });
}

export async function unlockSession(sessionId: string): Promise<SessionWithRecords> {
  const session = await prisma.attendanceSession.findUnique({
    where: { id: sessionId },
    select: { status: true },
  });

  if (!session) throw new NotFoundError('Attendance session');
  if (session.status !== 'LOCKED') {
    throw new ConflictError('This session is not locked');
  }

  return prisma.attendanceSession.update({
    where: { id: sessionId },
    data: { status: 'SUBMITTED', lockedAt: null },
    include: sessionInclude,
  });
}

export interface SessionFilters {
  classId?: string;
  sectionId?: string;
  subjectId?: string;
  status?: AttendanceSessionStatus;
  from?: Date;
  to?: Date;
}

export async function listSessions(
  user: AuthenticatedUser,
  query: ListQueryOptions,
  filters: SessionFilters,
): Promise<PaginatedData<Prisma.AttendanceSessionGetPayload<{ include: typeof listInclude }>>> {
  const where: Prisma.AttendanceSessionWhereInput = {
    ...(filters.classId ? { classId: filters.classId } : {}),
    ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
    ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.from || filters.to
      ? {
          date: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
    // Teachers only see the rolls they marked or sections they own.
    ...(user.role === 'TEACHER' && user.teacherId
      ? {
          OR: [
            { markedById: user.id },
            { section: { classTeacherId: user.teacherId } },
            { class: { classTeacherId: user.teacherId } },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.attendanceSession.findMany({
      where,
      include: listInclude,
      orderBy: { date: query.sortOrder },
      skip: query.skip,
      take: query.take,
    }),
    prisma.attendanceSession.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

const listInclude = {
  class: { select: { id: true, name: true } },
  section: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true, code: true } },
  markedBy: { select: { firstName: true, lastName: true } },
  _count: { select: { records: true } },
} satisfies Prisma.AttendanceSessionInclude;

export async function getSession(sessionId: string): Promise<SessionWithRecords> {
  const session = await prisma.attendanceSession.findUnique({
    where: { id: sessionId },
    include: sessionInclude,
  });

  if (!session) throw new NotFoundError('Attendance session');
  return session;
}

/**
 * Per-student attendance for a calendar month.
 *
 * Aggregated with groupBy rather than loading every record, so a 5,000-student
 * institution stays within the PRD's response-time budget.
 */
export async function getMonthlyAttendance(filters: {
  classId?: string;
  sectionId?: string;
  studentId?: string;
  year: number;
  month: number;
}) {
  const start = new Date(Date.UTC(filters.year, filters.month - 1, 1));
  const end = new Date(Date.UTC(filters.year, filters.month, 0, 23, 59, 59));

  const recordWhere: Prisma.AttendanceRecordWhereInput = {
    session: {
      date: { gte: start, lte: end },
      ...(filters.classId ? { classId: filters.classId } : {}),
      ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
    },
    ...(filters.studentId ? { studentId: filters.studentId } : {}),
  };

  const [grouped, students, holidays] = await Promise.all([
    prisma.attendanceRecord.groupBy({
      by: ['studentId', 'status'],
      where: recordWhere,
      _count: { _all: true },
    }),
    prisma.student.findMany({
      where: {
        deletedAt: null,
        ...(filters.studentId ? { id: filters.studentId } : {}),
        ...(filters.classId ? { classId: filters.classId } : {}),
        ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
      },
      select: {
        id: true,
        admissionNumber: true,
        rollNumber: true,
        user: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ rollNumber: 'asc' }, { admissionNumber: 'asc' }],
    }),
    prisma.holiday.findMany({
      where: { date: { gte: start, lte: end } },
      select: { name: true, date: true, endDate: true },
      orderBy: { date: 'asc' },
    }),
  ]);

  const tallies = new Map<string, Record<AttendanceStatus, number>>();
  for (const row of grouped) {
    const current =
      tallies.get(row.studentId) ??
      ({
        PRESENT: 0,
        ABSENT: 0,
        LATE: 0,
        HALF_DAY: 0,
        LEAVE: 0,
        HOLIDAY: 0,
      } satisfies Record<AttendanceStatus, number>);

    current[row.status] = row._count._all;
    tallies.set(row.studentId, current);
  }

  return {
    period: { year: filters.year, month: filters.month, start, end },
    holidays,
    students: students.map((student) => {
      const counts =
        tallies.get(student.id) ??
        ({ PRESENT: 0, ABSENT: 0, LATE: 0, HALF_DAY: 0, LEAVE: 0, HOLIDAY: 0 } as Record<
          AttendanceStatus,
          number
        >);

      // HOLIDAY days are excluded from the denominator — they are not sessions
      // a student could have attended.
      const marked =
        counts.PRESENT + counts.ABSENT + counts.LATE + counts.HALF_DAY + counts.LEAVE;
      const present = counts.PRESENT + counts.LATE + counts.HALF_DAY * 0.5;

      return {
        studentId: student.id,
        admissionNumber: student.admissionNumber,
        rollNumber: student.rollNumber,
        firstName: student.user.firstName,
        lastName: student.user.lastName,
        counts,
        totalMarked: marked,
        percentage: marked === 0 ? null : Number(((present / marked) * 100).toFixed(2)),
      };
    }),
  };
}

/** Day-by-day history for one student, used by the student and parent portals. */
export async function getStudentAttendance(
  studentId: string,
  range: { from?: Date; to?: Date },
) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, deletedAt: null },
    select: { id: true },
  });
  if (!student) throw new NotFoundError('Student');

  const records = await prisma.attendanceRecord.findMany({
    where: {
      studentId,
      ...(range.from || range.to
        ? {
            session: {
              date: {
                ...(range.from ? { gte: range.from } : {}),
                ...(range.to ? { lte: range.to } : {}),
              },
            },
          }
        : {}),
    },
    include: {
      session: {
        select: {
          date: true,
          subject: { select: { id: true, name: true, code: true } },
          period: { select: { name: true, startTime: true } },
        },
      },
    },
    orderBy: { session: { date: 'desc' } },
  });

  const summary = records.reduce<Record<AttendanceStatus, number>>(
    (accumulator, record) => {
      accumulator[record.status] += 1;
      return accumulator;
    },
    { PRESENT: 0, ABSENT: 0, LATE: 0, HALF_DAY: 0, LEAVE: 0, HOLIDAY: 0 },
  );

  const marked =
    summary.PRESENT + summary.ABSENT + summary.LATE + summary.HALF_DAY + summary.LEAVE;
  const present = summary.PRESENT + summary.LATE + summary.HALF_DAY * 0.5;

  return {
    summary,
    totalMarked: marked,
    percentage: marked === 0 ? null : Number(((present / marked) * 100).toFixed(2)),
    records: records.map((record) => ({
      id: record.id,
      date: record.session.date,
      status: record.status,
      minutesLate: record.minutesLate,
      remarks: record.remarks,
      subject: record.session.subject,
      period: record.session.period,
    })),
  };
}

/** Flat rows for the attendance report export. */
export async function getAttendanceReportRows(filters: {
  classId?: string;
  sectionId?: string;
  from: Date;
  to: Date;
}) {
  const students = await prisma.student.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      ...(filters.classId ? { classId: filters.classId } : {}),
      ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
    },
    select: {
      id: true,
      admissionNumber: true,
      rollNumber: true,
      user: { select: { firstName: true, lastName: true } },
      class: { select: { name: true } },
      section: { select: { name: true } },
    },
    orderBy: [{ rollNumber: 'asc' }, { admissionNumber: 'asc' }],
  });

  const grouped = await prisma.attendanceRecord.groupBy({
    by: ['studentId', 'status'],
    where: {
      studentId: { in: students.map((student) => student.id) },
      session: { date: { gte: filters.from, lte: filters.to } },
    },
    _count: { _all: true },
  });

  const tallies = new Map<string, Partial<Record<AttendanceStatus, number>>>();
  for (const row of grouped) {
    const current = tallies.get(row.studentId) ?? {};
    current[row.status] = row._count._all;
    tallies.set(row.studentId, current);
  }

  return students.map((student) => {
    const counts = tallies.get(student.id) ?? {};
    const presentCount = counts.PRESENT ?? 0;
    const lateCount = counts.LATE ?? 0;
    const halfDayCount = counts.HALF_DAY ?? 0;
    const absentCount = counts.ABSENT ?? 0;
    const leaveCount = counts.LEAVE ?? 0;

    const marked = presentCount + lateCount + halfDayCount + absentCount + leaveCount;
    const present = presentCount + lateCount + halfDayCount * 0.5;

    return {
      'Admission Number': student.admissionNumber,
      'Roll Number': student.rollNumber ?? '',
      Name: `${student.user.firstName} ${student.user.lastName}`,
      Class: student.class?.name ?? '',
      Section: student.section?.name ?? '',
      Present: presentCount,
      Late: lateCount,
      'Half Day': halfDayCount,
      Absent: absentCount,
      Leave: leaveCount,
      'Sessions Marked': marked,
      'Attendance %': marked === 0 ? '' : Number(((present / marked) * 100).toFixed(2)),
    };
  });
}

/** Sessions still in DRAFT for the caller — drives the "pending attendance" widget. */
export async function getPendingSessions(user: AuthenticatedUser) {
  return prisma.attendanceSession.findMany({
    where: {
      status: 'DRAFT',
      ...(user.role === 'TEACHER' ? { markedById: user.id } : {}),
    },
    include: listInclude,
    orderBy: { date: 'desc' },
    take: 20,
  });
}

/** Institution-wide attendance percentage for a single day (admin dashboard). */
export async function getDailySummary(date: Date) {
  const grouped = await prisma.attendanceRecord.groupBy({
    by: ['status'],
    where: { session: { date } },
    _count: { _all: true },
  });

  const counts = grouped.reduce<Record<string, number>>((accumulator, row) => {
    accumulator[row.status] = row._count._all;
    return accumulator;
  }, {});

  const presentCount = (counts['PRESENT'] ?? 0) + (counts['LATE'] ?? 0);
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const excludingHolidays = total - (counts['HOLIDAY'] ?? 0);

  return {
    date,
    counts,
    total: excludingHolidays,
    percentage:
      excludingHolidays === 0
        ? null
        : Number(((presentCount / excludingHolidays) * 100).toFixed(2)),
  };
}

/** Daily attendance percentages across a range — the dashboard trend chart. */
export async function getAttendanceTrend(from: Date, to: Date) {
  const rows = await prisma.$queryRaw<{ day: Date; present: bigint; total: bigint }[]>`
    SELECT
      s.date AS day,
      COUNT(*) FILTER (WHERE r.status IN ('PRESENT', 'LATE')) AS present,
      COUNT(*) FILTER (WHERE r.status <> 'HOLIDAY') AS total
    FROM attendance_records r
    JOIN attendance_sessions s ON s.id = r."sessionId"
    WHERE s.date BETWEEN ${from} AND ${to}
    GROUP BY s.date
    ORDER BY s.date ASC
  `;

  return rows.map((row) => {
    const total = Number(row.total);
    const present = Number(row.present);
    return {
      date: row.day,
      present,
      total,
      percentage: total === 0 ? null : Number(((present / total) * 100).toFixed(2)),
    };
  });
}

export function isPresentStatus(status: AttendanceStatus): boolean {
  return PRESENT_STATUSES.includes(status);
}
