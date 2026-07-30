import type { Request, Response } from 'express';
import { requireUser } from '@/middleware/authenticate';
import { auditFromRequest, redact } from '@/services/audit.service';
import * as studentService from '@/services/student.service';
import { persistFileAsset, deleteFileAsset } from '@/services/file.service';
import type { AuthenticatedUser } from '@/types/auth';
import { BadRequestError } from '@/utils/api-error';
import { sendCreated, sendPaginated, sendSuccess } from '@/utils/api-response';
import { asyncHandler } from '@/utils/async-handler';
import { sendExport } from '@/utils/export';
import { buildListQuery } from '@/utils/pagination';
import type {
  CreateStudentInput,
  PromoteStudentsInput,
  TransferStudentInput,
  UpdateStudentInput,
} from '@/validators/student.validator';

const MODULE = 'STUDENTS' as const;

function paramId(req: Request): string {
  return req.params['id'] as string;
}

/**
 * Derives the row-level scope for the caller.
 *
 * Admins see everything; students, parents and teachers are narrowed to their
 * own records, their children, or the classes they teach.
 */
function scopeFor(user: AuthenticatedUser): studentService.StudentScope {
  switch (user.role) {
    case 'STUDENT':
      return { studentId: user.studentId };
    case 'PARENT':
      return { guardianId: user.guardianId };
    case 'TEACHER':
      return { teacherId: user.teacherId };
    default:
      return {};
  }
}

function filtersFrom(req: Request): studentService.StudentFilters {
  return {
    academicYearId: req.query['academicYearId'] as string | undefined,
    classId: req.query['classId'] as string | undefined,
    sectionId: req.query['sectionId'] as string | undefined,
    gender: req.query['gender'] as never,
    bloodGroup: req.query['bloodGroup'] as never,
    status: req.query['status'] as never,
    admittedFrom: req.query['admittedFrom'] as Date | undefined,
    admittedTo: req.query['admittedTo'] as Date | undefined,
    includeArchived: req.query['includeArchived'] as boolean | undefined,
  };
}

export const listStudents = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const query = buildListQuery(req.query, {
    allowedSortFields: studentService.STUDENT_SORT_FIELDS,
    defaultSortBy: 'admissionNumber',
    defaultSortOrder: 'asc',
  });

  const { items, pagination } = await studentService.listStudents(
    query,
    filtersFrom(req),
    scopeFor(user),
  );

  sendPaginated(res, items, pagination, 'Students retrieved successfully');
});

export const getStudent = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const student = await studentService.getStudent(paramId(req), scopeFor(user));
  sendSuccess(res, student, 'Student retrieved successfully');
});

export const createStudent = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateStudentInput;
  const { student, accounts } = await studentService.createStudent(body);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'Student',
    entityId: student.id,
    description: `Admitted ${student.user.firstName} ${student.user.lastName} (${student.admissionNumber})`,
    newValue: redact(student),
  });

  sendCreated(
    res,
    {
      student,
      // Temporary passwords are returned once so an administrator can hand them
      // over when email delivery is not configured.
      provisionedAccounts: accounts.map((account) => ({
        email: account.email,
        temporaryPassword: account.temporaryPassword,
      })),
    },
    'Student admitted successfully',
  );
});

export const updateStudent = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = paramId(req);
  const before = await studentService.getStudent(id, scopeFor(user));
  const student = await studentService.updateStudent(id, req.body as UpdateStudentInput);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Student',
    entityId: id,
    description: `Updated student ${student.admissionNumber}`,
    oldValue: redact(before),
    newValue: redact(student),
  });

  sendSuccess(res, student, 'Student updated successfully');
});

export const transferStudent = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = paramId(req);

  const student = await studentService.transferStudent(
    id,
    req.body as TransferStudentInput,
    user.id,
  );

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Student',
    entityId: id,
    description: `Transferred student ${student.admissionNumber}`,
    newValue: redact({ classId: student.classId, sectionId: student.sectionId }),
  });

  sendSuccess(res, student, 'Student transferred successfully');
});

export const promoteStudents = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const body = req.body as PromoteStudentsInput;

  const result = await studentService.promoteStudents(body, user.id);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Student',
    description: `Promoted ${result.promoted} student(s)`,
    newValue: redact({ ...body, ...result }),
  });

  sendSuccess(res, result, `Promoted ${result.promoted} student(s)`);
});

export const changeStatus = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = paramId(req);
  const { status, remarks } = req.body as { status: never; remarks?: string };

  const student = await studentService.changeStudentStatus(id, status, remarks, user.id);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Student',
    entityId: id,
    description: `Changed status of ${student.admissionNumber} to ${student.status}`,
    newValue: redact({ status: student.status, remarks }),
  });

  sendSuccess(res, student, 'Student status updated successfully');
});

export const deleteStudent = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = paramId(req);
  const before = await studentService.getStudent(id, scopeFor(user));

  await studentService.deleteStudent(id);

  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'Student',
    entityId: id,
    description: `Deleted student ${before.admissionNumber}`,
    oldValue: redact(before),
  });

  sendSuccess(res, null, 'Student deleted successfully');
});

export const getTimeline = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const timeline = await studentService.getStudentTimeline(paramId(req), scopeFor(user));
  sendSuccess(res, timeline, 'Timeline retrieved successfully');
});

export const addTimelineEvent = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const event = await studentService.addTimelineEvent(paramId(req), req.body, user.id);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'StudentTimelineEvent',
    entityId: event.id,
    description: `Added timeline entry: ${event.title}`,
    newValue: redact(event),
  });

  sendCreated(res, event, 'Timeline entry added successfully');
});

export const addGuardian = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const guardians = await studentService.addGuardian(id, req.body);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'StudentGuardian',
    entityId: id,
    description: 'Linked a guardian to the student',
    newValue: redact(req.body),
  });

  sendCreated(res, guardians, 'Guardian linked successfully');
});

export const removeGuardian = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const guardianId = req.params['guardianId'] as string;

  await studentService.removeGuardian(id, guardianId);

  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'StudentGuardian',
    entityId: id,
    description: `Unlinked guardian ${guardianId}`,
  });

  sendSuccess(res, null, 'Guardian unlinked successfully');
});

export const uploadPhoto = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = paramId(req);

  if (!req.file) {
    throw new BadRequestError('Select a photo to upload', [
      { field: 'photo', message: 'No file was received' },
    ]);
  }

  const student = await studentService.getStudent(id, scopeFor(user));

  const asset = await persistFileAsset({
    file: req.file,
    category: 'STUDENTS',
    uploadedById: user.id,
  });

  const updated = await studentService.updateStudentPhoto(id, asset.id);

  // The previous photo is unreferenced now, so remove it from disk.
  if (student.photoId) {
    await deleteFileAsset(student.photoId);
  }

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Student',
    entityId: id,
    description: `Updated photo for ${student.admissionNumber}`,
  });

  sendSuccess(res, updated, 'Photo updated successfully');
});

export const getIdCard = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const data = await studentService.getIdCardData(paramId(req), scopeFor(user));

  await auditFromRequest(req, {
    action: 'EXPORT',
    module: MODULE,
    entityType: 'Student',
    entityId: paramId(req),
    description: 'Generated an ID card',
  });

  sendSuccess(res, data, 'ID card data retrieved successfully');
});

export const exportStudents = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const format = (req.query['format'] as 'csv' | 'xlsx' | undefined) ?? 'xlsx';

  const rows = await studentService.getStudentsForExport(filtersFrom(req), scopeFor(user));

  await auditFromRequest(req, {
    action: 'EXPORT',
    module: MODULE,
    entityType: 'Student',
    description: `Exported ${rows.length} student record(s) as ${format}`,
  });

  await sendExport(res, rows, `students-${new Date().toISOString().slice(0, 10)}`, format, 'Students');
});
