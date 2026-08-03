import { Prisma } from '@prisma/client';
import { prisma } from '@/config/prisma';
import type { AuthenticatedUser } from '@/types/auth';
import { ForbiddenError } from '@/utils/api-error';
import { getAssignmentStats } from './assignment.service';
import { getAttendanceTrend, getDailySummary } from './attendance.service';
import { getCollectionSummary, getCollectionTrend } from './fee/payment.service';

/**
 * Module 2 — Dashboard.
 *
 * Most of the heavy aggregation already lives in the module that owns the data;
 * this service composes those helpers and adds only the counts no other module
 * needed. Widgets and charts are served separately so the tiles paint before
 * the slower chart queries land (PRD §11, "loads under 2 seconds").
 */

/** Weekday names in the order Prisma's `DayOfWeek` enum declares them. */
const DAY_OF_WEEK = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
] as const;

/** Midnight UTC today — `@db.Date` columns store dates at exactly this offset. */
function startOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function today(): { date: Date; dayOfWeek: (typeof DAY_OF_WEEK)[number] } {
  const date = startOfToday();
  return { date, dayOfWeek: DAY_OF_WEEK[date.getUTCDay()] as (typeof DAY_OF_WEEK)[number] };
}

async function currentAcademicYearId(): Promise<string | undefined> {
  const year = await prisma.academicYear.findFirst({
    where: { isCurrent: true },
    select: { id: true },
  });
  return year?.id;
}

// ------------------------------------------------------------------
// Shared fragments
// ------------------------------------------------------------------

/** Exams that have not finished yet, soonest first. */
async function upcomingExams(classId?: string | null, take = 5) {
  return prisma.exam.findMany({
    where: {
      deletedAt: null,
      status: { in: ['SCHEDULED', 'ONGOING'] },
      endDate: { gte: startOfToday() },
      ...(classId ? { classId } : {}),
    },
    orderBy: { startDate: 'asc' },
    take,
    select: {
      id: true,
      name: true,
      type: true,
      startDate: true,
      endDate: true,
      class: { select: { name: true } },
    },
  });
}

/** Notices visible right now, pinned first. */
async function activeNotices(take = 5) {
  const now = new Date();
  return prisma.notice.findMany({
    where: {
      deletedAt: null,
      status: 'PUBLISHED',
      OR: [{ publishAt: null }, { publishAt: { lte: now } }],
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] }],
    },
    orderBy: [{ isPinned: 'desc' }, { publishAt: 'desc' }],
    take,
    select: {
      id: true,
      title: true,
      category: true,
      priority: true,
      isPinned: true,
      publishAt: true,
    },
  });
}

/** A section's timetable for one weekday, in period order. */
async function classesForDay(where: Prisma.TimetableSlotWhereInput) {
  const slots = await prisma.timetableSlot.findMany({
    where: { ...where, timetable: { isActive: true, deletedAt: null } },
    orderBy: { period: { sortOrder: 'asc' } },
    select: {
      id: true,
      type: true,
      period: { select: { name: true, startTime: true, endTime: true, isBreak: true } },
      room: { select: { name: true, code: true } },
      timetable: {
        select: { class: { select: { name: true } }, section: { select: { name: true } } },
      },
      classSubject: {
        select: {
          subject: { select: { name: true, code: true } },
          teacher: { select: { user: { select: { firstName: true, lastName: true } } } },
        },
      },
    },
  });

  return slots
    .filter((slot) => !slot.period.isBreak)
    .map((slot) => ({
      id: slot.id,
      type: slot.type,
      period: slot.period.name,
      startTime: slot.period.startTime,
      endTime: slot.period.endTime,
      subject: slot.classSubject?.subject.name ?? null,
      room: slot.room?.name ?? null,
      className: slot.timetable.class.name,
      sectionName: slot.timetable.section.name,
      teacher: slot.classSubject?.teacher
        ? `${slot.classSubject.teacher.user.firstName} ${slot.classSubject.teacher.user.lastName}`
        : null,
    }));
}

/** Attendance percentage for one student over the running academic year. */
async function studentAttendance(studentId: string) {
  const grouped = await prisma.attendanceRecord.groupBy({
    by: ['status'],
    where: { studentId },
    _count: { _all: true },
  });

  const counts = grouped.reduce<Record<string, number>>((accumulator, row) => {
    accumulator[row.status] = row._count._all;
    return accumulator;
  }, {});

  const present = (counts['PRESENT'] ?? 0) + (counts['LATE'] ?? 0);
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0) - (counts['HOLIDAY'] ?? 0);

  return {
    present,
    absent: counts['ABSENT'] ?? 0,
    total,
    percentage: total === 0 ? null : Number(((present / total) * 100).toFixed(2)),
  };
}

/** Unpaid balance across a student's invoices. */
async function studentFees(studentId: string) {
  const [outstanding, nextDue] = await Promise.all([
    prisma.invoice.aggregate({
      where: {
        studentId,
        deletedAt: null,
        status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] },
      },
      _sum: { balanceAmount: true },
      _count: { _all: true },
    }),
    prisma.invoice.findFirst({
      where: {
        studentId,
        deletedAt: null,
        status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] },
      },
      orderBy: { dueDate: 'asc' },
      select: { id: true, invoiceNumber: true, dueDate: true, balanceAmount: true },
    }),
  ]);

  return {
    outstanding: outstanding._sum.balanceAmount ?? new Prisma.Decimal(0),
    unpaidInvoices: outstanding._count._all,
    nextDue,
  };
}

// ------------------------------------------------------------------
// Per-role summaries
// ------------------------------------------------------------------

async function adminSummary(user: AuthenticatedUser) {
  const { date } = today();
  // The audit trail names who did what. Accountants and librarians share this
  // institution-wide view but have no business reading other staff's actions.
  const canSeeActivity = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
  const academicYearId = await currentAcademicYearId();
  // "New admissions" is deliberately a rolling 30-day window rather than
  // year-to-date, so the tile keeps moving once the admission season closes.
  const admissionsSince = addDays(date, -30);

  const [students, teachers, newAdmissions, attendance, fees, exams, activity] = await Promise.all([
    prisma.student.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
    prisma.teacher.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
    prisma.student.count({ where: { deletedAt: null, admissionDate: { gte: admissionsSince } } }),
    getDailySummary(date),
    getCollectionSummary(academicYearId ? { academicYearId } : {}),
    upcomingExams(),
    canSeeActivity ? recentActivity() : Promise.resolve([]),
  ]);

  return {
    role: 'ADMIN' as const,
    totals: { students, teachers, newAdmissions, upcomingExams: exams.length },
    attendanceToday: {
      percentage: attendance.percentage,
      present: (attendance.counts['PRESENT'] ?? 0) + (attendance.counts['LATE'] ?? 0),
      absent: attendance.counts['ABSENT'] ?? 0,
      total: attendance.total,
    },
    fees: {
      collected: fees.totalCollected,
      pending: fees.totalOutstanding,
      collectionRate: fees.collectionRate,
      outstandingInvoices: fees.outstandingInvoiceCount,
    },
    upcomingExams: exams,
    recentActivity: activity,
    canViewActivity: canSeeActivity,
  };
}

/** The Recent Activities widget, read from the audit trail Module 20 writes. */
async function recentActivity(take = 8) {
  const rows = await prisma.auditLog.findMany({
    // Sign-in noise would crowd out everything else on a busy morning.
    where: { action: { notIn: ['LOGIN', 'LOGOUT', 'LOGIN_FAILED'] } },
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      id: true,
      action: true,
      module: true,
      description: true,
      createdAt: true,
      user: { select: { firstName: true, lastName: true, role: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    module: row.module,
    description: row.description,
    at: row.createdAt,
    actor: row.user ? `${row.user.firstName} ${row.user.lastName}` : 'System',
  }));
}

async function teacherSummary(user: AuthenticatedUser) {
  const { dayOfWeek } = today();

  if (!user.teacherId) {
    return {
      role: 'TEACHER' as const,
      todaysClasses: [],
      pendingAttendance: 0,
      assignments: { total: 0, published: 0, awaitingEvaluation: 0, overdue: 0 },
      upcomingExams: [],
      announcements: await activeNotices(),
    };
  }

  const [todaysClasses, assignments, exams, announcements, pendingAttendance] = await Promise.all([
    classesForDay({ dayOfWeek, teacherId: user.teacherId }),
    getAssignmentStats(user),
    upcomingExams(),
    activeNotices(),
    pendingAttendanceCount(user.teacherId),
  ]);

  return {
    role: 'TEACHER' as const,
    todaysClasses,
    pendingAttendance,
    assignments,
    upcomingExams: exams,
    announcements,
  };
}

/**
 * Sections this teacher owns that have no submitted register for today.
 * Draft sessions still count as pending — they are started, not finished.
 */
async function pendingAttendanceCount(teacherId: string): Promise<number> {
  const { date } = today();

  const sections = await prisma.section.findMany({
    where: { deletedAt: null, OR: [{ classTeacherId: teacherId }, { class: { classTeacherId: teacherId } }] },
    select: { id: true },
  });
  if (sections.length === 0) return 0;

  const submitted = await prisma.attendanceSession.findMany({
    where: {
      date,
      sectionId: { in: sections.map((section) => section.id) },
      status: { in: ['SUBMITTED', 'LOCKED'] },
    },
    select: { sectionId: true },
    distinct: ['sectionId'],
  });

  return sections.length - submitted.length;
}

async function studentSummary(user: AuthenticatedUser) {
  const { dayOfWeek } = today();

  if (!user.studentId) {
    throw new ForbiddenError('This account is not linked to a student record.');
  }

  const student = await prisma.student.findUnique({
    where: { id: user.studentId },
    select: { id: true, classId: true, sectionId: true },
  });

  const [attendance, fees, assignments, exams, notices, todaysClasses] = await Promise.all([
    studentAttendance(user.studentId),
    studentFees(user.studentId),
    studentAssignments(user.studentId, student?.classId ?? null, student?.sectionId ?? null),
    upcomingExams(student?.classId ?? null),
    activeNotices(),
    student?.sectionId
      ? classesForDay({ dayOfWeek, timetable: { sectionId: student.sectionId } })
      : Promise.resolve([]),
  ]);

  return {
    role: 'STUDENT' as const,
    attendance,
    fees,
    assignments,
    upcomingExams: exams,
    notices,
    todaysClasses,
  };
}

/** Published assignments for a student's class, split by what they still owe. */
async function studentAssignments(
  studentId: string,
  classId: string | null,
  sectionId: string | null,
) {
  if (!classId) return { due: 0, submitted: 0, evaluated: 0, upcoming: [] };

  const scope: Prisma.AssignmentWhereInput = {
    deletedAt: null,
    status: 'PUBLISHED',
    classId,
    OR: [{ sectionId: null }, ...(sectionId ? [{ sectionId }] : [])],
  };

  const [total, submitted, evaluated, upcoming] = await Promise.all([
    prisma.assignment.count({ where: scope }),
    prisma.assignmentSubmission.count({
      where: { studentId, assignment: scope, status: { in: ['SUBMITTED', 'LATE', 'EVALUATED'] } },
    }),
    prisma.assignmentSubmission.count({
      where: { studentId, assignment: scope, status: 'EVALUATED' },
    }),
    prisma.assignment.findMany({
      where: { ...scope, dueDate: { gte: new Date() }, submissions: { none: { studentId } } },
      orderBy: { dueDate: 'asc' },
      take: 5,
      select: {
        id: true,
        title: true,
        dueDate: true,
        maxMarks: true,
        subject: { select: { name: true } },
      },
    }),
  ]);

  return { due: total - submitted, submitted, evaluated, upcoming };
}

async function parentSummary(user: AuthenticatedUser) {
  if (!user.guardianId) {
    throw new ForbiddenError('This account is not linked to a guardian record.');
  }

  const links = await prisma.studentGuardian.findMany({
    where: { guardianId: user.guardianId },
    select: {
      student: {
        select: {
          id: true,
          admissionNumber: true,
          rollNumber: true,
          user: { select: { firstName: true, lastName: true } },
          class: { select: { id: true, name: true } },
          section: { select: { name: true } },
        },
      },
    },
  });

  const children = await Promise.all(
    links.map(async ({ student }) => {
      const [attendance, fees, marks, assignments] = await Promise.all([
        studentAttendance(student.id),
        studentFees(student.id),
        recentMarks(student.id),
        studentAssignments(student.id, student.class?.id ?? null, null),
      ]);

      return {
        id: student.id,
        name: `${student.user.firstName} ${student.user.lastName}`,
        admissionNumber: student.admissionNumber,
        className: student.class?.name ?? null,
        sectionName: student.section?.name ?? null,
        attendance,
        fees,
        marks,
        homework: { due: assignments.due, upcoming: assignments.upcoming },
      };
    }),
  );

  return { role: 'PARENT' as const, children, announcements: await activeNotices() };
}

/** Latest published marks for a student, newest first. */
async function recentMarks(studentId: string, take = 5) {
  const rows = await prisma.mark.findMany({
    where: { studentId, examSchedule: { exam: { status: 'RESULTS_PUBLISHED' } } },
    orderBy: { updatedAt: 'desc' },
    take,
    select: {
      id: true,
      marksObtained: true,
      isAbsent: true,
      examSchedule: {
        select: {
          maxMarks: true,
          subject: { select: { name: true } },
          exam: { select: { name: true } },
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    subject: row.examSchedule.subject.name,
    exam: row.examSchedule.exam.name,
    marksObtained: row.marksObtained,
    maxMarks: row.examSchedule.maxMarks,
    isAbsent: row.isAbsent,
  }));
}

// ------------------------------------------------------------------
// Public surface
// ------------------------------------------------------------------

export type DashboardSummary = Awaited<ReturnType<typeof getDashboardSummary>>;

/** Returns the widget payload for whichever dashboard this role sees. */
export async function getDashboardSummary(user: AuthenticatedUser) {
  switch (user.role) {
    case 'TEACHER':
      return teacherSummary(user);
    case 'STUDENT':
      return studentSummary(user);
    case 'PARENT':
      return parentSummary(user);
    default:
      // SUPER_ADMIN, ADMIN, ACCOUNTANT and LIBRARIAN all read the institution
      // -wide view; their permission grants decide which tiles they can act on.
      return adminSummary(user);
  }
}

/**
 * Chart data for the admin dashboard (PRD lines 182–188). Only the admin-side
 * roles have an institution-wide view, so this is not served to the others.
 */
export async function getDashboardCharts(user: AuthenticatedUser, days: number) {
  if (user.role === 'STUDENT' || user.role === 'PARENT' || user.role === 'TEACHER') {
    throw new ForbiddenError('Charts are available on the administrative dashboard only.');
  }

  const to = startOfToday();
  const from = addDays(to, -days);
  const academicYearId = await currentAcademicYearId();

  const [attendance, collection, growth, gender, departments] = await Promise.all([
    getAttendanceTrend(from, to),
    getCollectionTrend(from, to),
    studentGrowth(),
    genderDistribution(),
    departmentStatistics(),
  ]);

  return {
    range: { from, to, days },
    attendanceTrend: attendance.map((row) => ({ date: row.date, percentage: row.percentage })),
    feeCollection: collection,
    studentGrowth: growth,
    genderDistribution: gender,
    departmentStatistics: departments,
    academicYearId: academicYearId ?? null,
  };
}

/** Cumulative admissions per month over the last 12 months. */
async function studentGrowth() {
  const rows = await prisma.$queryRaw<{ month: Date; admitted: bigint }[]>`
    SELECT
      DATE_TRUNC('month', "admissionDate")::date AS month,
      COUNT(*) AS admitted
    FROM students
    WHERE "deletedAt" IS NULL
      AND "admissionDate" >= (CURRENT_DATE - INTERVAL '12 months')
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  let running = 0;
  return rows.map((row) => {
    running += Number(row.admitted);
    return { month: row.month, admitted: Number(row.admitted), total: running };
  });
}

async function genderDistribution() {
  const grouped = await prisma.student.groupBy({
    by: ['gender'],
    where: { deletedAt: null, status: 'ACTIVE' },
    _count: { _all: true },
  });

  return grouped.map((row) => ({ gender: row.gender, count: row._count._all }));
}

/** Student and teacher headcount per department, busiest first. */
async function departmentStatistics() {
  const departments = await prisma.department.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      code: true,
      _count: { select: { teachers: true, subjects: true } },
      classes: {
        where: { deletedAt: null },
        select: { _count: { select: { students: true } } },
      },
    },
  });

  return departments
    .map((department) => ({
      id: department.id,
      name: department.name,
      code: department.code,
      teachers: department._count.teachers,
      subjects: department._count.subjects,
      students: department.classes.reduce((sum, klass) => sum + klass._count.students, 0),
    }))
    .sort((a, b) => b.students - a.students);
}
