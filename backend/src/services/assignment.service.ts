import { Prisma, type AssignmentStatus } from '@prisma/client';
import { prisma } from '@/config/prisma';
import type { ListQueryOptions, PaginatedData } from '@/types/api';
import type { AuthenticatedUser } from '@/types/auth';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '@/utils/api-error';
import { buildPaginationMeta } from '@/utils/pagination';
import type {
  CreateAssignmentInput,
  EvaluateSubmissionInput,
  UpdateAssignmentInput,
} from '@/validators/assignment.validator';

const assignmentListInclude = {
  class: { select: { id: true, name: true, code: true } },
  section: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true, code: true } },
  teacher: {
    select: {
      id: true,
      employeeId: true,
      user: { select: { firstName: true, lastName: true } },
    },
  },
  attachments: { include: { file: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } } } },
  _count: { select: { submissions: true } },
} satisfies Prisma.AssignmentInclude;

export type AssignmentListItem = Prisma.AssignmentGetPayload<{
  include: typeof assignmentListInclude;
}>;

const assignmentDetailInclude = {
  ...assignmentListInclude,
  submissions: {
    include: {
      student: {
        select: {
          id: true,
          admissionNumber: true,
          rollNumber: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
      attachments: {
        include: { file: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } } },
      },
      evaluatedBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: { student: { rollNumber: 'asc' } },
  },
} satisfies Prisma.AssignmentInclude;

export type AssignmentDetail = Prisma.AssignmentGetPayload<{
  include: typeof assignmentDetailInclude;
}>;

export interface AssignmentFilters {
  classId?: string;
  sectionId?: string;
  subjectId?: string;
  teacherId?: string;
  status?: AssignmentStatus[];
  dueFrom?: Date;
  dueTo?: Date;
  onlyPending?: boolean;
}

/**
 * Row-level scope.
 *
 * Teachers see the assignments they created; students and parents see only
 * published work targeted at their class/section.
 */
async function buildScope(user: AuthenticatedUser): Promise<Prisma.AssignmentWhereInput> {
  if (user.role === 'TEACHER' && user.teacherId) {
    return { teacherId: user.teacherId };
  }

  if (user.role === 'STUDENT' && user.studentId) {
    const student = await prisma.student.findUnique({
      where: { id: user.studentId },
      select: { classId: true, sectionId: true },
    });

    if (!student?.classId) return { id: '__none__' };

    return {
      status: { in: ['PUBLISHED', 'CLOSED'] },
      classId: student.classId,
      OR: [{ sectionId: null }, { sectionId: student.sectionId }],
    };
  }

  if (user.role === 'PARENT' && user.guardianId) {
    const links = await prisma.studentGuardian.findMany({
      where: { guardianId: user.guardianId },
      select: { student: { select: { classId: true, sectionId: true } } },
    });

    const classIds = links
      .map((link) => link.student.classId)
      .filter((id): id is string => id !== null);

    if (classIds.length === 0) return { id: '__none__' };

    return { status: { in: ['PUBLISHED', 'CLOSED'] }, classId: { in: classIds } };
  }

  return {};
}

export async function listAssignments(
  user: AuthenticatedUser,
  query: ListQueryOptions,
  filters: AssignmentFilters,
): Promise<PaginatedData<AssignmentListItem>> {
  const scope = await buildScope(user);

  const where: Prisma.AssignmentWhereInput = {
    deletedAt: null,
    ...scope,
    ...(filters.classId ? { classId: filters.classId } : {}),
    ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
    ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
    ...(filters.teacherId ? { teacherId: filters.teacherId } : {}),
    ...(filters.status?.length ? { status: { in: filters.status } } : {}),
    ...(filters.dueFrom || filters.dueTo
      ? {
          dueDate: {
            ...(filters.dueFrom ? { gte: filters.dueFrom } : {}),
            ...(filters.dueTo ? { lte: filters.dueTo } : {}),
          },
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { title: { contains: query.search, mode: 'insensitive' } },
            { subject: { name: { contains: query.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
    // "Pending" means this student has not submitted yet.
    ...(filters.onlyPending && user.studentId
      ? {
          submissions: {
            none: {
              studentId: user.studentId,
              status: { in: ['SUBMITTED', 'LATE', 'EVALUATED'] },
            },
          },
        }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.assignment.findMany({
      where,
      include: assignmentListInclude,
      orderBy: { dueDate: query.sortOrder },
      skip: query.skip,
      take: query.take,
    }),
    prisma.assignment.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

export async function getAssignment(
  user: AuthenticatedUser,
  id: string,
): Promise<AssignmentDetail> {
  const scope = await buildScope(user);

  const assignment = await prisma.assignment.findFirst({
    where: { id, deletedAt: null, ...scope },
    include: assignmentDetailInclude,
  });

  if (!assignment) throw new NotFoundError('Assignment');

  // A student must never see their classmates' submissions.
  if (user.role === 'STUDENT' || user.role === 'PARENT') {
    const visibleStudentIds = await resolveVisibleStudentIds(user);
    return {
      ...assignment,
      submissions: assignment.submissions.filter((submission) =>
        visibleStudentIds.includes(submission.studentId),
      ),
    };
  }

  return assignment;
}

async function resolveVisibleStudentIds(user: AuthenticatedUser): Promise<string[]> {
  if (user.studentId) return [user.studentId];

  if (user.guardianId) {
    const links = await prisma.studentGuardian.findMany({
      where: { guardianId: user.guardianId },
      select: { studentId: true },
    });
    return links.map((link) => link.studentId);
  }

  return [];
}

/** The teacher must actually teach the subject to that class. */
async function assertTeachesOffering(
  teacherId: string,
  classId: string,
  sectionId: string | null,
  subjectId: string,
): Promise<void> {
  const offering = await prisma.classSubject.count({
    where: {
      teacherId,
      classId,
      subjectId,
      ...(sectionId ? { OR: [{ sectionId }, { sectionId: null }] } : {}),
    },
  });

  if (offering === 0) {
    throw new ForbiddenError('You are not assigned to teach this subject to that class');
  }
}

export async function createAssignment(
  user: AuthenticatedUser,
  input: CreateAssignmentInput,
): Promise<AssignmentDetail> {
  if (!user.teacherId) {
    throw new ForbiddenError('Only teachers can create assignments');
  }

  await assertTeachesOffering(
    user.teacherId,
    input.classId,
    input.sectionId ?? null,
    input.subjectId,
  );

  const created = await prisma.assignment.create({
    data: {
      title: input.title,
      description: input.description,
      classId: input.classId,
      sectionId: input.sectionId ?? null,
      subjectId: input.subjectId,
      teacherId: user.teacherId,
      assignedDate: input.assignedDate,
      dueDate: input.dueDate,
      maxMarks: input.maxMarks,
      allowLateSubmission: input.allowLateSubmission,
      status: input.publish ? 'PUBLISHED' : 'DRAFT',
      publishedAt: input.publish ? new Date() : null,
    },
  });

  // Publishing creates a PENDING submission row per student, so the teacher's
  // evaluation list is complete from the outset.
  if (input.publish) {
    await createPendingSubmissions(created.id, input.classId, input.sectionId ?? null);
  }

  return prisma.assignment.findUniqueOrThrow({
    where: { id: created.id },
    include: assignmentDetailInclude,
  });
}

async function createPendingSubmissions(
  assignmentId: string,
  classId: string,
  sectionId: string | null,
): Promise<void> {
  const students = await prisma.student.findMany({
    where: {
      classId,
      ...(sectionId ? { sectionId } : {}),
      deletedAt: null,
      status: 'ACTIVE',
    },
    select: { id: true },
  });

  if (students.length === 0) return;

  await prisma.assignmentSubmission.createMany({
    data: students.map((student) => ({
      assignmentId,
      studentId: student.id,
      status: 'PENDING' as const,
    })),
    skipDuplicates: true,
  });
}

export async function updateAssignment(
  user: AuthenticatedUser,
  id: string,
  input: UpdateAssignmentInput,
): Promise<AssignmentDetail> {
  const existing = await prisma.assignment.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, teacherId: true, status: true, classId: true, sectionId: true },
  });

  if (!existing) throw new NotFoundError('Assignment');

  if (user.role === 'TEACHER' && existing.teacherId !== user.teacherId) {
    throw new ForbiddenError('You can only edit your own assignments');
  }

  const isPublishing = input.status === 'PUBLISHED' && existing.status === 'DRAFT';

  await prisma.assignment.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.sectionId !== undefined ? { sectionId: input.sectionId } : {}),
      ...(input.assignedDate !== undefined ? { assignedDate: input.assignedDate } : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
      ...(input.maxMarks !== undefined ? { maxMarks: input.maxMarks } : {}),
      ...(input.allowLateSubmission !== undefined
        ? { allowLateSubmission: input.allowLateSubmission }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(isPublishing ? { publishedAt: new Date() } : {}),
    },
  });

  if (isPublishing) {
    await createPendingSubmissions(id, existing.classId, existing.sectionId);
  }

  return prisma.assignment.findUniqueOrThrow({
    where: { id },
    include: assignmentDetailInclude,
  });
}

export async function deleteAssignment(user: AuthenticatedUser, id: string): Promise<void> {
  const assignment = await prisma.assignment.findFirst({
    where: { id, deletedAt: null },
    select: {
      teacherId: true,
      _count: { select: { submissions: { where: { status: { not: 'PENDING' } } } } },
    },
  });

  if (!assignment) throw new NotFoundError('Assignment');

  if (user.role === 'TEACHER' && assignment.teacherId !== user.teacherId) {
    throw new ForbiddenError('You can only delete your own assignments');
  }

  if (assignment._count.submissions > 0) {
    throw new ConflictError('Students have already submitted work for this assignment.', [
      {
        field: 'id',
        message: `${assignment._count.submissions} submission(s) received — close it instead of deleting`,
      },
    ]);
  }

  await prisma.assignment.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function addAttachment(assignmentId: string, fileId: string): Promise<void> {
  await prisma.assignmentAttachment.create({ data: { assignmentId, fileId } });
}

/** Records a student's submission, flagging it late when past the deadline. */
export async function submitAssignment(
  user: AuthenticatedUser,
  assignmentId: string,
  content: string | undefined,
): Promise<AssignmentDetail['submissions'][number]> {
  if (!user.studentId) {
    throw new ForbiddenError('Only students can submit assignments');
  }

  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId, deletedAt: null },
    select: {
      id: true,
      status: true,
      dueDate: true,
      allowLateSubmission: true,
      classId: true,
      sectionId: true,
    },
  });

  if (!assignment) throw new NotFoundError('Assignment');

  if (assignment.status !== 'PUBLISHED') {
    throw new ConflictError(
      assignment.status === 'CLOSED'
        ? 'This assignment is closed for submissions'
        : 'This assignment is not open for submissions',
    );
  }

  const student = await prisma.student.findUnique({
    where: { id: user.studentId },
    select: { classId: true, sectionId: true },
  });

  const isTargeted =
    student?.classId === assignment.classId &&
    (assignment.sectionId === null || assignment.sectionId === student?.sectionId);

  if (!isTargeted) {
    throw new ForbiddenError('This assignment was not set for your class');
  }

  const now = new Date();
  const isLate = now.getTime() > assignment.dueDate.getTime();

  if (isLate && !assignment.allowLateSubmission) {
    throw new ConflictError('The deadline has passed and late submissions are not accepted', [
      { field: 'dueDate', message: `Due ${assignment.dueDate.toISOString()}` },
    ]);
  }

  const existing = await prisma.assignmentSubmission.findUnique({
    where: { assignmentId_studentId: { assignmentId, studentId: user.studentId } },
    select: { id: true, status: true },
  });

  // An already-marked submission may not be silently overwritten.
  if (existing?.status === 'EVALUATED') {
    throw new ConflictError('This submission has already been marked');
  }

  const submission = await prisma.assignmentSubmission.upsert({
    where: { assignmentId_studentId: { assignmentId, studentId: user.studentId } },
    create: {
      assignmentId,
      studentId: user.studentId,
      content: content ?? null,
      status: isLate ? 'LATE' : 'SUBMITTED',
      submittedAt: now,
    },
    update: {
      content: content ?? null,
      status: isLate ? 'LATE' : 'SUBMITTED',
      submittedAt: now,
      // Clear any previous evaluation when re-submitting after a RESUBMIT.
      marksObtained: null,
      feedback: null,
      evaluatedById: null,
      evaluatedAt: null,
    },
    include: {
      student: {
        select: {
          id: true,
          admissionNumber: true,
          rollNumber: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
      attachments: {
        include: { file: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } } },
      },
      evaluatedBy: { select: { firstName: true, lastName: true } },
    },
  });

  return submission;
}

export async function addSubmissionAttachment(
  submissionId: string,
  fileId: string,
): Promise<void> {
  await prisma.submissionAttachment.create({ data: { submissionId, fileId } });
}

export async function getSubmissionForStudent(assignmentId: string, studentId: string) {
  return prisma.assignmentSubmission.findUnique({
    where: { assignmentId_studentId: { assignmentId, studentId } },
    include: {
      attachments: {
        include: { file: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } } },
      },
      evaluatedBy: { select: { firstName: true, lastName: true } },
    },
  });
}

/** Teacher marks a submission. */
export async function evaluateSubmission(
  user: AuthenticatedUser,
  submissionId: string,
  input: EvaluateSubmissionInput,
) {
  const submission = await prisma.assignmentSubmission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      status: true,
      assignment: { select: { id: true, teacherId: true, maxMarks: true } },
    },
  });

  if (!submission) throw new NotFoundError('Submission');

  if (user.role === 'TEACHER' && submission.assignment.teacherId !== user.teacherId) {
    throw new ForbiddenError('You can only evaluate submissions for your own assignments');
  }

  if (submission.status === 'PENDING') {
    throw new ConflictError('This student has not submitted anything yet');
  }

  if (input.marksObtained > Number(submission.assignment.maxMarks)) {
    throw new BadRequestError('Marks cannot exceed the assignment total', [
      {
        field: 'marksObtained',
        message: `Maximum is ${String(submission.assignment.maxMarks)}`,
      },
    ]);
  }

  return prisma.assignmentSubmission.update({
    where: { id: submissionId },
    data: {
      marksObtained: input.marksObtained,
      feedback: input.feedback ?? null,
      status: input.status,
      evaluatedById: user.id,
      evaluatedAt: new Date(),
    },
    include: {
      student: {
        select: {
          id: true,
          admissionNumber: true,
          rollNumber: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
      evaluatedBy: { select: { firstName: true, lastName: true } },
    },
  });
}

/** Submission roster for one assignment, used by the evaluation screen. */
export async function listSubmissions(
  user: AuthenticatedUser,
  assignmentId: string,
  query: ListQueryOptions,
  status?: string,
) {
  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId, deletedAt: null },
    select: { teacherId: true },
  });

  if (!assignment) throw new NotFoundError('Assignment');

  if (user.role === 'TEACHER' && assignment.teacherId !== user.teacherId) {
    throw new ForbiddenError('You can only view submissions for your own assignments');
  }

  const where: Prisma.AssignmentSubmissionWhereInput = {
    assignmentId,
    ...(status ? { status: status as never } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.assignmentSubmission.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            admissionNumber: true,
            rollNumber: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
        attachments: {
          include: { file: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } } },
        },
        evaluatedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ student: { rollNumber: 'asc' } }],
      skip: query.skip,
      take: query.take,
    }),
    prisma.assignmentSubmission.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

/** Counts for the teacher dashboard widget. */
export async function getAssignmentStats(user: AuthenticatedUser) {
  const scope = await buildScope(user);

  const [total, published, awaitingEvaluation, overdue] = await Promise.all([
    prisma.assignment.count({ where: { deletedAt: null, ...scope } }),
    prisma.assignment.count({ where: { deletedAt: null, status: 'PUBLISHED', ...scope } }),
    prisma.assignmentSubmission.count({
      where: {
        status: { in: ['SUBMITTED', 'LATE'] },
        assignment: { deletedAt: null, ...scope },
      },
    }),
    prisma.assignment.count({
      where: { deletedAt: null, status: 'PUBLISHED', dueDate: { lt: new Date() }, ...scope },
    }),
  ]);

  return { total, published, awaitingEvaluation, overdue };
}
