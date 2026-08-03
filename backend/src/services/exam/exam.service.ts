import { Prisma, type ExamStatus, type ExamType } from '@prisma/client';
import { prisma } from '@/config/prisma';
import type { ListQueryOptions, PaginatedData } from '@/types/api';
import type { AuthenticatedUser } from '@/types/auth';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '@/utils/api-error';
import { ownClassIds } from '@/utils/enrolment-scope';
import { buildPaginationMeta } from '@/utils/pagination';
import type {
  CreateExamInput,
  EnterMarksInput,
  ExamScheduleInput,
} from '@/validators/exam.validator';
import { gradeFromPercentage, resolveGradeScale } from './grade.service';

const examListInclude = {
  academicYear: { select: { id: true, name: true } },
  semester: { select: { id: true, name: true } },
  class: { select: { id: true, name: true, code: true } },
  gradeScale: { select: { id: true, name: true } },
  createdBy: { select: { firstName: true, lastName: true } },
  _count: { select: { schedules: true, reportCards: true } },
} satisfies Prisma.ExamInclude;

export type ExamListItem = Prisma.ExamGetPayload<{ include: typeof examListInclude }>;

const examDetailInclude = {
  ...examListInclude,
  schedules: {
    include: {
      class: { select: { id: true, name: true, code: true } },
      section: { select: { id: true, name: true } },
      subject: { select: { id: true, name: true, code: true } },
      room: { select: { id: true, name: true, code: true } },
      invigilator: {
        select: {
          id: true,
          employeeId: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
      _count: { select: { marks: true } },
    },
    orderBy: [{ examDate: 'asc' }, { startTime: 'asc' }],
  },
} satisfies Prisma.ExamInclude;

export type ExamDetail = Prisma.ExamGetPayload<{ include: typeof examDetailInclude }>;

export interface ExamFilters {
  academicYearId?: string;
  semesterId?: string;
  classId?: string;
  type?: ExamType;
  status?: ExamStatus[];
}

/**
 * Students and parents see only exams for the class they are enrolled in, and
 * never a draft or cancelled one. An exam with no class is institution-wide, so
 * it stays visible to everybody.
 */
async function buildScope(user: AuthenticatedUser): Promise<Prisma.ExamWhereInput> {
  if (user.role !== 'STUDENT' && user.role !== 'PARENT') return {};

  const classIds = await ownClassIds(user);

  return {
    status: { in: ['SCHEDULED', 'ONGOING', 'COMPLETED', 'RESULTS_PUBLISHED'] },
    OR: [{ classId: null }, { classId: { in: classIds } }],
  };
}

export async function listExams(
  user: AuthenticatedUser,
  query: ListQueryOptions,
  filters: ExamFilters,
): Promise<PaginatedData<ExamListItem>> {
  const scope = await buildScope(user);

  const where: Prisma.ExamWhereInput = {
    deletedAt: null,
    ...scope,
    ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
    ...(filters.semesterId ? { semesterId: filters.semesterId } : {}),
    ...(filters.classId ? { classId: filters.classId } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.status?.length ? { status: { in: filters.status } } : {}),
    ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.exam.findMany({
      where,
      include: examListInclude,
      orderBy: { startDate: query.sortOrder },
      skip: query.skip,
      take: query.take,
    }),
    prisma.exam.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

export async function getExam(user: AuthenticatedUser, id: string): Promise<ExamDetail> {
  const scope = await buildScope(user);

  const exam = await prisma.exam.findFirst({
    where: { id, deletedAt: null, ...scope },
    include: examDetailInclude,
  });

  if (!exam) throw new NotFoundError('Exam');
  return exam;
}

export async function createExam(
  input: CreateExamInput,
  createdById: string,
): Promise<ExamDetail> {
  const created = await prisma.exam.create({
    data: {
      name: input.name,
      type: input.type,
      academicYearId: input.academicYearId,
      semesterId: input.semesterId ?? null,
      classId: input.classId ?? null,
      startDate: input.startDate,
      endDate: input.endDate,
      gradeScaleId: input.gradeScaleId ?? null,
      description: input.description ?? null,
      status: 'DRAFT',
      createdById,
    },
  });

  return prisma.exam.findUniqueOrThrow({ where: { id: created.id }, include: examDetailInclude });
}

export async function updateExam(
  id: string,
  data: Prisma.ExamUncheckedUpdateInput,
): Promise<ExamDetail> {
  const existing = await prisma.exam.findFirst({
    where: { id, deletedAt: null },
    select: { status: true },
  });

  if (!existing) throw new NotFoundError('Exam');

  // Once results are out, the exam definition is history.
  if (existing.status === 'RESULTS_PUBLISHED' && data.status !== 'COMPLETED') {
    throw new ConflictError('Published results must be withdrawn before the exam can be edited');
  }

  await prisma.exam.update({ where: { id }, data });
  return prisma.exam.findUniqueOrThrow({ where: { id }, include: examDetailInclude });
}

export async function deleteExam(id: string): Promise<void> {
  const exam = await prisma.exam.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { reportCards: true } } },
  });

  if (!exam) throw new NotFoundError('Exam');

  if (exam.status === 'RESULTS_PUBLISHED' || exam._count.reportCards > 0) {
    throw new ConflictError('An exam with published results cannot be deleted.', [
      { field: 'id', message: `${exam._count.reportCards} report card(s) exist` },
    ]);
  }

  await prisma.exam.update({ where: { id }, data: { deletedAt: new Date() } });
}

// ------------------------------------------------------------------ Schedules

/** Adds a subject paper, guarding the NULL-distinct unique on sectionId. */
export async function addSchedule(examId: string, input: ExamScheduleInput) {
  const exam = await prisma.exam.findFirst({
    where: { id: examId, deletedAt: null },
    select: { id: true, status: true, startDate: true, endDate: true },
  });

  if (!exam) throw new NotFoundError('Exam');

  if (exam.status === 'RESULTS_PUBLISHED') {
    throw new ConflictError('Results are published; the schedule can no longer change');
  }

  if (input.examDate < exam.startDate || input.examDate > exam.endDate) {
    throw new BadRequestError('The paper date must fall inside the exam window', [
      {
        field: 'examDate',
        message: `Between ${exam.startDate.toISOString().slice(0, 10)} and ${exam.endDate.toISOString().slice(0, 10)}`,
      },
    ]);
  }

  // Postgres treats NULLs as distinct, so the composite unique index does not
  // prevent a duplicate when sectionId is null. Check explicitly.
  const duplicate = await prisma.examSchedule.findFirst({
    where: {
      examId,
      classId: input.classId,
      subjectId: input.subjectId,
      sectionId: input.sectionId ?? null,
    },
    select: { id: true },
  });

  if (duplicate) {
    throw new ConflictError('This subject is already scheduled for that class in this exam', [
      { field: 'subjectId', message: 'Duplicate paper' },
    ]);
  }

  await assertNoRoomClash(input, null);

  return prisma.examSchedule.create({
    data: {
      examId,
      classId: input.classId,
      sectionId: input.sectionId ?? null,
      subjectId: input.subjectId,
      examDate: input.examDate,
      startTime: input.startTime,
      endTime: input.endTime,
      roomId: input.roomId ?? null,
      invigilatorId: input.invigilatorId ?? null,
      maxMarks: input.maxMarks,
      passingMarks: input.passingMarks,
      weightage: input.weightage,
      instructions: input.instructions ?? null,
    },
    include: {
      class: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } },
      subject: { select: { id: true, name: true, code: true } },
      room: { select: { id: true, name: true, code: true } },
    },
  });
}

/** Two papers must not occupy the same room at overlapping times. */
async function assertNoRoomClash(
  input: Pick<ExamScheduleInput, 'roomId' | 'examDate' | 'startTime' | 'endTime'>,
  excludeScheduleId: string | null,
): Promise<void> {
  if (!input.roomId) return;

  const sameRoom = await prisma.examSchedule.findMany({
    where: {
      roomId: input.roomId,
      examDate: input.examDate,
      ...(excludeScheduleId ? { id: { not: excludeScheduleId } } : {}),
    },
    select: {
      startTime: true,
      endTime: true,
      subject: { select: { name: true } },
      room: { select: { name: true } },
    },
  });

  // Times are stored as HH:MM strings, so lexical comparison is chronological.
  const clash = sameRoom.find(
    (existing) => input.startTime < existing.endTime && input.endTime > existing.startTime,
  );

  if (clash) {
    throw new ConflictError(
      `${clash.room?.name ?? 'That room'} is already booked for ${clash.subject.name} (${clash.startTime}–${clash.endTime})`,
      [{ field: 'roomId', message: 'Room double-booked' }],
    );
  }
}

export async function updateSchedule(
  scheduleId: string,
  input: Partial<ExamScheduleInput>,
) {
  const existing = await prisma.examSchedule.findUnique({
    where: { id: scheduleId },
    select: {
      id: true,
      examDate: true,
      startTime: true,
      endTime: true,
      roomId: true,
      maxMarks: true,
      exam: { select: { status: true } },
      _count: { select: { marks: true } },
    },
  });

  if (!existing) throw new NotFoundError('Exam paper');

  if (existing.exam.status === 'RESULTS_PUBLISHED') {
    throw new ConflictError('Results are published; this paper can no longer change');
  }

  // Lowering the maximum below an already-entered mark would corrupt results.
  if (input.maxMarks !== undefined && existing._count.marks > 0) {
    const highest = await prisma.mark.aggregate({
      where: { examScheduleId: scheduleId },
      _max: { marksObtained: true },
    });

    const top = highest._max.marksObtained;
    if (top !== null && Number(top) > input.maxMarks) {
      throw new ConflictError('Marks already entered exceed the new maximum', [
        { field: 'maxMarks', message: `The highest recorded mark is ${String(top)}` },
      ]);
    }
  }

  await assertNoRoomClash(
    {
      roomId: input.roomId ?? existing.roomId,
      examDate: input.examDate ?? existing.examDate,
      startTime: input.startTime ?? existing.startTime,
      endTime: input.endTime ?? existing.endTime,
    },
    scheduleId,
  );

  return prisma.examSchedule.update({
    where: { id: scheduleId },
    data: {
      ...(input.examDate !== undefined ? { examDate: input.examDate } : {}),
      ...(input.startTime !== undefined ? { startTime: input.startTime } : {}),
      ...(input.endTime !== undefined ? { endTime: input.endTime } : {}),
      ...(input.roomId !== undefined ? { roomId: input.roomId } : {}),
      ...(input.invigilatorId !== undefined ? { invigilatorId: input.invigilatorId } : {}),
      ...(input.maxMarks !== undefined ? { maxMarks: input.maxMarks } : {}),
      ...(input.passingMarks !== undefined ? { passingMarks: input.passingMarks } : {}),
      ...(input.weightage !== undefined ? { weightage: input.weightage } : {}),
      ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
    },
    include: {
      class: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } },
      subject: { select: { id: true, name: true, code: true } },
      room: { select: { id: true, name: true, code: true } },
    },
  });
}

export async function deleteSchedule(scheduleId: string): Promise<void> {
  const schedule = await prisma.examSchedule.findUnique({
    where: { id: scheduleId },
    select: { exam: { select: { status: true } }, _count: { select: { marks: true } } },
  });

  if (!schedule) throw new NotFoundError('Exam paper');

  if (schedule._count.marks > 0) {
    throw new ConflictError('Marks have already been entered for this paper.', [
      { field: 'id', message: `${schedule._count.marks} mark(s) recorded` },
    ]);
  }

  await prisma.examSchedule.delete({ where: { id: scheduleId } });
}

// ---------------------------------------------------------------------- Marks

/** Roster for a paper, pre-filled with whatever has already been entered. */
export async function getMarksSheet(user: AuthenticatedUser, scheduleId: string) {
  const schedule = await prisma.examSchedule.findUnique({
    where: { id: scheduleId },
    include: {
      exam: { select: { id: true, name: true, status: true, gradeScaleId: true } },
      class: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } },
      subject: { select: { id: true, name: true, code: true } },
      marks: true,
    },
  });

  if (!schedule) throw new NotFoundError('Exam paper');

  // A teacher may only enter marks for a subject they actually teach.
  if (user.role === 'TEACHER' && user.teacherId) {
    const teaches = await prisma.classSubject.count({
      where: {
        teacherId: user.teacherId,
        classId: schedule.classId,
        subjectId: schedule.subjectId,
        ...(schedule.sectionId ? { OR: [{ sectionId: schedule.sectionId }, { sectionId: null }] } : {}),
      },
    });

    if (teaches === 0) {
      throw new ForbiddenError('You do not teach this subject to that class');
    }
  }

  const students = await prisma.student.findMany({
    where: {
      classId: schedule.classId,
      ...(schedule.sectionId ? { sectionId: schedule.sectionId } : {}),
      deletedAt: null,
      status: { in: ['ACTIVE', 'SUSPENDED'] },
    },
    select: {
      id: true,
      admissionNumber: true,
      rollNumber: true,
      user: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ rollNumber: 'asc' }, { admissionNumber: 'asc' }],
  });

  const marksByStudent = new Map(schedule.marks.map((mark) => [mark.studentId, mark]));

  return {
    schedule: {
      id: schedule.id,
      examId: schedule.exam.id,
      examName: schedule.exam.name,
      examStatus: schedule.exam.status,
      className: schedule.class.name,
      sectionName: schedule.section?.name ?? null,
      subject: schedule.subject,
      examDate: schedule.examDate,
      maxMarks: schedule.maxMarks,
      passingMarks: schedule.passingMarks,
      isLocked: schedule.exam.status === 'RESULTS_PUBLISHED',
    },
    students: students.map((student) => {
      const mark = marksByStudent.get(student.id);
      return {
        studentId: student.id,
        admissionNumber: student.admissionNumber,
        rollNumber: student.rollNumber,
        firstName: student.user.firstName,
        lastName: student.user.lastName,
        marksObtained: mark?.marksObtained ?? null,
        isAbsent: mark?.isAbsent ?? false,
        grade: mark?.grade ?? null,
        remarks: mark?.remarks ?? null,
      };
    }),
  };
}

/** Saves marks for a paper, deriving each student's grade as it goes. */
export async function enterMarks(
  user: AuthenticatedUser,
  scheduleId: string,
  input: EnterMarksInput,
) {
  const schedule = await prisma.examSchedule.findUnique({
    where: { id: scheduleId },
    select: {
      id: true,
      classId: true,
      sectionId: true,
      maxMarks: true,
      exam: { select: { status: true, gradeScaleId: true } },
    },
  });

  if (!schedule) throw new NotFoundError('Exam paper');

  if (schedule.exam.status === 'RESULTS_PUBLISHED') {
    throw new ConflictError('Results are published; marks can no longer be changed');
  }

  const maxMarks = Number(schedule.maxMarks);
  const invalid = input.marks.filter(
    (mark) =>
      !mark.isAbsent &&
      mark.marksObtained !== null &&
      mark.marksObtained !== undefined &&
      mark.marksObtained > maxMarks,
  );

  if (invalid.length > 0) {
    throw new BadRequestError(`Marks cannot exceed ${maxMarks}`, [
      { field: 'marks', message: `${invalid.length} entr(y/ies) exceed the maximum` },
    ]);
  }

  // Every student must belong to the cohort this paper is set for.
  const validStudents = await prisma.student.count({
    where: {
      id: { in: input.marks.map((mark) => mark.studentId) },
      classId: schedule.classId,
      ...(schedule.sectionId ? { sectionId: schedule.sectionId } : {}),
      deletedAt: null,
    },
  });

  if (validStudents !== input.marks.length) {
    throw new BadRequestError('One or more students are not in this cohort', [
      { field: 'marks', message: 'Roster and paper do not match' },
    ]);
  }

  const scale = await resolveGradeScale(schedule.exam.gradeScaleId);

  await prisma.$transaction(async (tx) => {
    for (const mark of input.marks) {
      // An absent student has no percentage, so no grade is assigned.
      const graded =
        mark.isAbsent || mark.marksObtained === null || mark.marksObtained === undefined
          ? null
          : gradeFromPercentage((mark.marksObtained / maxMarks) * 100, scale);

      await tx.mark.upsert({
        where: { examScheduleId_studentId: { examScheduleId: scheduleId, studentId: mark.studentId } },
        create: {
          examScheduleId: scheduleId,
          studentId: mark.studentId,
          marksObtained: mark.isAbsent ? null : (mark.marksObtained ?? null),
          isAbsent: mark.isAbsent,
          grade: graded?.grade ?? null,
          gradePoint: graded?.gradePoint ?? null,
          remarks: mark.remarks ?? null,
          enteredById: user.id,
        },
        update: {
          marksObtained: mark.isAbsent ? null : (mark.marksObtained ?? null),
          isAbsent: mark.isAbsent,
          grade: graded?.grade ?? null,
          gradePoint: graded?.gradePoint ?? null,
          remarks: mark.remarks ?? null,
          enteredById: user.id,
        },
      });
    }
  });

  return getMarksSheet(user, scheduleId);
}

/** Marks entry progress per paper, so an administrator can see what is outstanding. */
export async function getMarksProgress(examId: string) {
  const schedules = await prisma.examSchedule.findMany({
    where: { examId },
    select: {
      id: true,
      classId: true,
      sectionId: true,
      subject: { select: { id: true, name: true, code: true } },
      class: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } },
      _count: { select: { marks: true } },
    },
    orderBy: [{ examDate: 'asc' }],
  });

  return Promise.all(
    schedules.map(async (schedule) => {
      const expected = await prisma.student.count({
        where: {
          classId: schedule.classId,
          ...(schedule.sectionId ? { sectionId: schedule.sectionId } : {}),
          deletedAt: null,
          status: { in: ['ACTIVE', 'SUSPENDED'] },
        },
      });

      return {
        scheduleId: schedule.id,
        subject: schedule.subject,
        class: schedule.class,
        section: schedule.section,
        entered: schedule._count.marks,
        expected,
        isComplete: expected > 0 && schedule._count.marks >= expected,
      };
    }),
  );
}

/**
 * Flat marks rows for the exam report export (PRD Module 18).
 *
 * One row per student per paper rather than a subject-per-column matrix, so
 * the shape stays the same whatever subjects a class happens to sit.
 * Independent of report cards, which may not have been generated yet.
 */
export async function getExamResultRows(filters: {
  examId?: string;
  classId?: string;
  academicYearId?: string;
}) {
  const marks = await prisma.mark.findMany({
    where: {
      examSchedule: {
        ...(filters.classId ? { classId: filters.classId } : {}),
        exam: {
          deletedAt: null,
          ...(filters.examId ? { id: filters.examId } : {}),
          ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
        },
      },
    },
    orderBy: [
      { examSchedule: { exam: { startDate: 'desc' } } },
      { student: { rollNumber: 'asc' } },
    ],
    select: {
      marksObtained: true,
      isAbsent: true,
      grade: true,
      student: {
        select: {
          admissionNumber: true,
          rollNumber: true,
          user: { select: { firstName: true, lastName: true } },
          class: { select: { name: true } },
          section: { select: { name: true } },
        },
      },
      examSchedule: {
        select: {
          examDate: true,
          maxMarks: true,
          passingMarks: true,
          subject: { select: { name: true, code: true } },
          exam: { select: { name: true, type: true } },
        },
      },
    },
  });

  return marks.map((mark) => {
    const obtained = mark.marksObtained === null ? null : Number(mark.marksObtained);
    const passing = Number(mark.examSchedule.passingMarks);

    return {
      Exam: mark.examSchedule.exam.name,
      'Exam type': mark.examSchedule.exam.type,
      Class: mark.student.class?.name ?? '',
      Section: mark.student.section?.name ?? '',
      'Admission number': mark.student.admissionNumber,
      'Roll number': mark.student.rollNumber ?? '',
      Student: `${mark.student.user.firstName} ${mark.student.user.lastName}`,
      Subject: mark.examSchedule.subject.name,
      'Subject code': mark.examSchedule.subject.code,
      'Exam date': mark.examSchedule.examDate.toISOString().slice(0, 10),
      'Max marks': Number(mark.examSchedule.maxMarks),
      'Marks obtained': mark.isAbsent ? '' : (obtained ?? ''),
      Absent: mark.isAbsent ? 'Yes' : 'No',
      Grade: mark.grade ?? '',
      Result: mark.isAbsent ? 'Absent' : obtained === null ? '' : obtained >= passing ? 'Pass' : 'Fail',
    };
  });
}
