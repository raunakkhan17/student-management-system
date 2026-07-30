import { Prisma } from '@prisma/client';
import { prisma } from '@/config/prisma';
import type { ListQueryOptions, PaginatedData } from '@/types/api';
import type { AuthenticatedUser } from '@/types/auth';
import { ConflictError, ForbiddenError, NotFoundError } from '@/utils/api-error';
import { buildPaginationMeta } from '@/utils/pagination';
import { notify } from '@/services/notification.service';
import { gradeFromPercentage, resolveGradeScale } from './grade.service';

const reportCardInclude = {
  student: {
    select: {
      id: true,
      admissionNumber: true,
      rollNumber: true,
      user: { select: { firstName: true, lastName: true } },
      class: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } },
    },
  },
  exam: { select: { id: true, name: true, type: true, startDate: true, endDate: true } },
  academicYear: { select: { id: true, name: true } },
  generatedBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.ReportCardInclude;

export type ReportCardRecord = Prisma.ReportCardGetPayload<{ include: typeof reportCardInclude }>;

interface StudentTotals {
  studentId: string;
  totalMarks: number;
  obtainedMarks: number;
  /** Sum of grade points, used for the GPA. */
  gradePointSum: number;
  gradedPapers: number;
  failedAnyPaper: boolean;
}

/**
 * Publishes results for an exam.
 *
 * One transaction recomputes every report card and the whole ranking, so the
 * cohort is never left half-ranked. Ranking uses competition ordering: equal
 * percentages share a rank and the next rank skips accordingly.
 */
export async function publishResults(
  examId: string,
  generatedById: string,
  allowIncomplete: boolean,
): Promise<{ published: number; ranked: number }> {
  const exam = await prisma.exam.findFirst({
    where: { id: examId, deletedAt: null },
    select: {
      id: true,
      name: true,
      academicYearId: true,
      gradeScaleId: true,
      status: true,
      schedules: {
        select: {
          id: true,
          classId: true,
          sectionId: true,
          maxMarks: true,
          passingMarks: true,
          weightage: true,
        },
      },
    },
  });

  if (!exam) throw new NotFoundError('Exam');

  if (exam.status === 'RESULTS_PUBLISHED') {
    throw new ConflictError('Results for this exam are already published');
  }

  if (exam.schedules.length === 0) {
    throw new ConflictError('This exam has no papers scheduled', [
      { field: 'id', message: 'Add at least one subject paper first' },
    ]);
  }

  const scale = await resolveGradeScale(exam.gradeScaleId);

  const marks = await prisma.mark.findMany({
    where: { examSchedule: { examId } },
    select: {
      studentId: true,
      marksObtained: true,
      isAbsent: true,
      gradePoint: true,
      examScheduleId: true,
    },
  });

  if (marks.length === 0) {
    throw new ConflictError('No marks have been entered for this exam');
  }

  // Completeness check: every student in every cohort should have every paper.
  if (!allowIncomplete) {
    const missing = await findMissingMarks(exam.schedules, marks);
    if (missing > 0) {
      throw new ConflictError(
        `${missing} mark(s) are still missing. Complete entry, or publish with the "allow incomplete" option.`,
        [{ field: 'marks', message: `${missing} outstanding entr(y/ies)` }],
      );
    }
  }

  const scheduleById = new Map(exam.schedules.map((schedule) => [schedule.id, schedule]));
  const totalsByStudent = new Map<string, StudentTotals>();

  for (const mark of marks) {
    const schedule = scheduleById.get(mark.examScheduleId);
    if (!schedule) continue;

    const current =
      totalsByStudent.get(mark.studentId) ??
      ({
        studentId: mark.studentId,
        totalMarks: 0,
        obtainedMarks: 0,
        gradePointSum: 0,
        gradedPapers: 0,
        failedAnyPaper: false,
      } satisfies StudentTotals);

    const maxMarks = Number(schedule.maxMarks);
    const obtained = mark.isAbsent ? 0 : Number(mark.marksObtained ?? 0);

    // An absent paper still counts against the total — otherwise a student
    // could improve their percentage by missing an exam.
    current.totalMarks += maxMarks;
    current.obtainedMarks += obtained;

    if (mark.isAbsent || obtained < Number(schedule.passingMarks)) {
      current.failedAnyPaper = true;
    }

    if (mark.gradePoint !== null) {
      current.gradePointSum += Number(mark.gradePoint);
      current.gradedPapers += 1;
    }

    totalsByStudent.set(mark.studentId, current);
  }

  // Attendance percentage is shown on the report card, so gather it in one pass.
  const attendanceByStudent = await getAttendancePercentages([...totalsByStudent.keys()]);

  const computed = [...totalsByStudent.values()].map((totals) => {
    const percentage = totals.totalMarks === 0 ? 0 : (totals.obtainedMarks / totals.totalMarks) * 100;
    const graded = gradeFromPercentage(percentage, scale);

    return {
      studentId: totals.studentId,
      totalMarks: totals.totalMarks,
      obtainedMarks: totals.obtainedMarks,
      percentage: Number(percentage.toFixed(2)),
      grade: graded.grade,
      gpa:
        totals.gradedPapers === 0
          ? null
          : Number((totals.gradePointSum / totals.gradedPapers).toFixed(2)),
      // Failing any single paper fails the exam, regardless of the aggregate.
      isPass: graded.isPass && !totals.failedAnyPaper,
      attendancePercent: attendanceByStudent.get(totals.studentId) ?? null,
    };
  });

  // Competition ranking: sort descending, then assign ranks with ties shared.
  const ranked = [...computed].sort((a, b) => b.percentage - a.percentage);
  const rankByStudent = new Map<string, number>();

  let previousPercentage: number | null = null;
  let previousRank = 0;

  ranked.forEach((entry, index) => {
    const rank = previousPercentage === entry.percentage ? previousRank : index + 1;
    rankByStudent.set(entry.studentId, rank);
    previousPercentage = entry.percentage;
    previousRank = rank;
  });

  const publishedAt = new Date();

  await prisma.$transaction(async (tx) => {
    for (const entry of computed) {
      const data = {
        academicYearId: exam.academicYearId,
        totalMarks: entry.totalMarks,
        obtainedMarks: entry.obtainedMarks,
        percentage: entry.percentage,
        grade: entry.grade,
        gpa: entry.gpa,
        rank: rankByStudent.get(entry.studentId) ?? null,
        attendancePercent: entry.attendancePercent,
        isPass: entry.isPass,
        publishedAt,
        generatedById,
      };

      await tx.reportCard.upsert({
        where: { studentId_examId: { studentId: entry.studentId, examId } },
        create: { studentId: entry.studentId, examId, ...data },
        update: data,
      });
    }

    await tx.exam.update({
      where: { id: examId },
      data: { status: 'RESULTS_PUBLISHED', resultsPublishedAt: publishedAt },
    });

  });

  // Sent after the commit so nobody is told about results that failed to save.
  const audience = await resolveResultAudience(computed.map((entry) => entry.studentId));

  await notify({
    userIds: audience,
    type: 'RESULT_PUBLISHED',
    title: 'Results published',
    body: `Results for ${exam.name} are now available.`,
    link: `/exams/${examId}/result`,
    entityType: 'Exam',
    entityId: examId,
  });

  return { published: computed.length, ranked: rankByStudent.size };
}

/** Counts marks that should exist for this exam but do not. */
async function findMissingMarks(
  schedules: { id: string; classId: string; sectionId: string | null }[],
  marks: { studentId: string; examScheduleId: string }[],
): Promise<number> {
  const enteredBySchedule = new Map<string, Set<string>>();
  for (const mark of marks) {
    const set = enteredBySchedule.get(mark.examScheduleId) ?? new Set<string>();
    set.add(mark.studentId);
    enteredBySchedule.set(mark.examScheduleId, set);
  }

  let missing = 0;

  for (const schedule of schedules) {
    const expected = await prisma.student.count({
      where: {
        classId: schedule.classId,
        ...(schedule.sectionId ? { sectionId: schedule.sectionId } : {}),
        deletedAt: null,
        status: { in: ['ACTIVE', 'SUSPENDED'] },
      },
    });

    missing += Math.max(0, expected - (enteredBySchedule.get(schedule.id)?.size ?? 0));
  }

  return missing;
}

/** Overall attendance percentage per student, printed on the report card. */
async function getAttendancePercentages(studentIds: string[]): Promise<Map<string, number>> {
  if (studentIds.length === 0) return new Map();

  const grouped = await prisma.attendanceRecord.groupBy({
    by: ['studentId', 'status'],
    where: { studentId: { in: studentIds } },
    _count: { _all: true },
  });

  const tallies = new Map<string, { present: number; marked: number }>();

  for (const row of grouped) {
    // HOLIDAY days are not attendable, so they stay out of the denominator.
    if (row.status === 'HOLIDAY') continue;

    const current = tallies.get(row.studentId) ?? { present: 0, marked: 0 };
    current.marked += row._count._all;

    if (row.status === 'PRESENT' || row.status === 'LATE') {
      current.present += row._count._all;
    } else if (row.status === 'HALF_DAY') {
      current.present += row._count._all * 0.5;
    }

    tallies.set(row.studentId, current);
  }

  const result = new Map<string, number>();
  for (const [studentId, tally] of tallies) {
    if (tally.marked > 0) {
      result.set(studentId, Number(((tally.present / tally.marked) * 100).toFixed(2)));
    }
  }

  return result;
}

/**
 * Everyone who should hear that results are out: each student, plus their
 * guardians, since parents monitor progress (PRD Module 2).
 */
async function resolveResultAudience(studentIds: string[]): Promise<string[]> {
  const students = await prisma.student.findMany({
    where: { id: { in: studentIds } },
    select: { userId: true, guardians: { select: { guardian: { select: { userId: true } } } } },
  });

  const userIds = new Set<string>();

  for (const student of students) {
    userIds.add(student.userId);
    for (const link of student.guardians) {
      if (link.guardian.userId) userIds.add(link.guardian.userId);
    }
  }

  return [...userIds];
}

/** Withdraws published results so marks can be corrected. */
export async function withdrawResults(examId: string): Promise<void> {
  const exam = await prisma.exam.findFirst({
    where: { id: examId, deletedAt: null },
    select: { status: true },
  });

  if (!exam) throw new NotFoundError('Exam');

  if (exam.status !== 'RESULTS_PUBLISHED') {
    throw new ConflictError('Results for this exam are not published');
  }

  await prisma.$transaction([
    // Report cards are kept but unpublished, so history is not destroyed.
    prisma.reportCard.updateMany({ where: { examId }, data: { publishedAt: null } }),
    prisma.exam.update({
      where: { id: examId },
      data: { status: 'COMPLETED', resultsPublishedAt: null },
    }),
  ]);
}

export interface ReportCardFilters {
  examId?: string;
  studentId?: string;
  classId?: string;
  academicYearId?: string;
}

export async function listReportCards(
  user: AuthenticatedUser,
  query: ListQueryOptions,
  filters: ReportCardFilters,
): Promise<PaginatedData<ReportCardRecord>> {
  const scope = await buildReportCardScope(user);

  const where: Prisma.ReportCardWhereInput = {
    ...scope,
    ...(filters.examId ? { examId: filters.examId } : {}),
    ...(filters.studentId ? { studentId: filters.studentId } : {}),
    ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
    ...(filters.classId ? { student: { classId: filters.classId } } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.reportCard.findMany({
      where,
      include: reportCardInclude,
      orderBy: [{ exam: { startDate: 'desc' } }, { rank: 'asc' }],
      skip: query.skip,
      take: query.take,
    }),
    prisma.reportCard.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

/** Students see their own cards; parents see their children's. */
async function buildReportCardScope(
  user: AuthenticatedUser,
): Promise<Prisma.ReportCardWhereInput> {
  if (user.role === 'STUDENT') {
    // Unpublished cards must stay invisible.
    return { studentId: user.studentId ?? '__none__', publishedAt: { not: null } };
  }

  if (user.role === 'PARENT') {
    const links = await prisma.studentGuardian.findMany({
      where: { guardianId: user.guardianId ?? '' },
      select: { studentId: true },
    });

    return {
      studentId: { in: links.map((link) => link.studentId) },
      publishedAt: { not: null },
    };
  }

  return {};
}

/** Full report card with the per-subject breakdown. */
export async function getReportCard(user: AuthenticatedUser, id: string) {
  const scope = await buildReportCardScope(user);

  const card = await prisma.reportCard.findFirst({
    where: { id, ...scope },
    include: reportCardInclude,
  });

  if (!card) throw new NotFoundError('Report card');

  const marks = await prisma.mark.findMany({
    where: { studentId: card.studentId, examSchedule: { examId: card.examId } },
    include: {
      examSchedule: {
        select: {
          maxMarks: true,
          passingMarks: true,
          examDate: true,
          subject: { select: { id: true, name: true, code: true } },
        },
      },
    },
    orderBy: { examSchedule: { examDate: 'asc' } },
  });

  const institution = await prisma.institution.findFirst({
    select: { name: true, code: true, logoId: true, principalName: true },
  });

  return {
    institution,
    card,
    subjects: marks.map((mark) => ({
      subject: mark.examSchedule.subject,
      examDate: mark.examSchedule.examDate,
      maxMarks: mark.examSchedule.maxMarks,
      passingMarks: mark.examSchedule.passingMarks,
      marksObtained: mark.marksObtained,
      isAbsent: mark.isAbsent,
      grade: mark.grade,
      gradePoint: mark.gradePoint,
      isPass:
        !mark.isAbsent &&
        mark.marksObtained !== null &&
        Number(mark.marksObtained) >= Number(mark.examSchedule.passingMarks),
      remarks: mark.remarks,
    })),
  };
}

/** Cohort ranking for an exam. */
export async function getRankings(examId: string) {
  const cards = await prisma.reportCard.findMany({
    where: { examId },
    include: reportCardInclude,
    orderBy: [{ rank: 'asc' }],
  });

  return cards.map((card) => ({
    rank: card.rank,
    studentId: card.studentId,
    admissionNumber: card.student.admissionNumber,
    rollNumber: card.student.rollNumber,
    name: `${card.student.user.firstName} ${card.student.user.lastName}`,
    className: card.student.class?.name ?? null,
    sectionName: card.student.section?.name ?? null,
    obtainedMarks: card.obtainedMarks,
    totalMarks: card.totalMarks,
    percentage: card.percentage,
    grade: card.grade,
    gpa: card.gpa,
    isPass: card.isPass,
  }));
}

/** Aggregate exam statistics for the analytics dashboard. */
export async function getExamStatistics(examId: string) {
  const cards = await prisma.reportCard.findMany({
    where: { examId },
    select: { percentage: true, isPass: true, grade: true },
  });

  if (cards.length === 0) {
    return {
      studentCount: 0,
      passCount: 0,
      failCount: 0,
      passRate: null,
      averagePercentage: null,
      highestPercentage: null,
      lowestPercentage: null,
      gradeDistribution: [] as { grade: string; count: number }[],
    };
  }

  const percentages = cards.map((card) => Number(card.percentage));
  const passCount = cards.filter((card) => card.isPass).length;

  const gradeCounts = new Map<string, number>();
  for (const card of cards) {
    if (card.grade) {
      gradeCounts.set(card.grade, (gradeCounts.get(card.grade) ?? 0) + 1);
    }
  }

  return {
    studentCount: cards.length,
    passCount,
    failCount: cards.length - passCount,
    passRate: Number(((passCount / cards.length) * 100).toFixed(2)),
    averagePercentage: Number(
      (percentages.reduce((sum, value) => sum + value, 0) / percentages.length).toFixed(2),
    ),
    highestPercentage: Math.max(...percentages),
    lowestPercentage: Math.min(...percentages),
    gradeDistribution: [...gradeCounts.entries()]
      .map(([grade, count]) => ({ grade, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/** A student's own result for one exam, used by the student and parent portals. */
export async function getStudentResult(
  user: AuthenticatedUser,
  studentId: string,
  examId: string,
) {
  if (user.role === 'STUDENT' && user.studentId !== studentId) {
    throw new ForbiddenError('You can only view your own results');
  }

  if (user.role === 'PARENT') {
    const isLinked = await prisma.studentGuardian.count({
      where: { guardianId: user.guardianId ?? '', studentId },
    });
    if (isLinked === 0) {
      throw new ForbiddenError('You can only view results for your own children');
    }
  }

  const card = await prisma.reportCard.findUnique({
    where: { studentId_examId: { studentId, examId } },
    select: { id: true, publishedAt: true },
  });

  if (!card) throw new NotFoundError('Result');

  if (!card.publishedAt && (user.role === 'STUDENT' || user.role === 'PARENT')) {
    throw new NotFoundError('Result');
  }

  return getReportCard(user, card.id);
}
