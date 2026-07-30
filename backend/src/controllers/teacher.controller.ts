import type { Request, Response } from 'express';
import { requireUser } from '@/middleware/authenticate';
import { auditFromRequest, redact } from '@/services/audit.service';
import { deleteFileAsset, persistFileAsset } from '@/services/file.service';
import * as teacherService from '@/services/teacher.service';
import { BadRequestError } from '@/utils/api-error';
import { sendCreated, sendPaginated, sendSuccess } from '@/utils/api-response';
import { asyncHandler } from '@/utils/async-handler';
import { sendExport } from '@/utils/export';
import { buildListQuery } from '@/utils/pagination';
import type { CreateTeacherInput, UpdateTeacherInput } from '@/validators/teacher.validator';

const MODULE = 'TEACHERS' as const;

function paramId(req: Request): string {
  return req.params['id'] as string;
}

function filtersFrom(req: Request): teacherService.TeacherFilters {
  return {
    departmentId: req.query['departmentId'] as string | undefined,
    subjectId: req.query['subjectId'] as string | undefined,
    status: req.query['status'] as never,
    employmentType: req.query['employmentType'] as never,
    gender: req.query['gender'] as never,
    includeArchived: req.query['includeArchived'] as boolean | undefined,
  };
}

export const listTeachers = asyncHandler(async (req: Request, res: Response) => {
  const query = buildListQuery(req.query, {
    allowedSortFields: teacherService.TEACHER_SORT_FIELDS,
    defaultSortBy: 'employeeId',
    defaultSortOrder: 'asc',
  });

  const { items, pagination } = await teacherService.listTeachers(query, filtersFrom(req));
  sendPaginated(res, items, pagination, 'Teachers retrieved successfully');
});

export const listTeacherOptions = asyncHandler(async (req: Request, res: Response) => {
  const options = await teacherService.listTeacherOptions(
    req.query['departmentId'] as string | undefined,
  );
  sendSuccess(res, options, 'Teacher options retrieved successfully');
});

export const getTeacher = asyncHandler(async (req: Request, res: Response) => {
  const teacher = await teacherService.getTeacher(paramId(req));
  sendSuccess(res, teacher, 'Teacher retrieved successfully');
});

export const createTeacher = asyncHandler(async (req: Request, res: Response) => {
  const { teacher, temporaryPassword } = await teacherService.createTeacher(
    req.body as CreateTeacherInput,
  );

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'Teacher',
    entityId: teacher.id,
    description: `Added teacher ${teacher.user.firstName} ${teacher.user.lastName} (${teacher.employeeId})`,
    newValue: redact(teacher),
  });

  sendCreated(
    res,
    {
      teacher,
      provisionedAccount: temporaryPassword
        ? { email: teacher.user.email, temporaryPassword }
        : null,
    },
    'Teacher added successfully',
  );
});

export const updateTeacher = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const before = await teacherService.getTeacher(id);
  const teacher = await teacherService.updateTeacher(id, req.body as UpdateTeacherInput);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Teacher',
    entityId: id,
    description: `Updated teacher ${teacher.employeeId}`,
    oldValue: redact(before),
    newValue: redact(teacher),
  });

  sendSuccess(res, teacher, 'Teacher updated successfully');
});

export const assignSubjects = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const { subjectIds } = req.body as { subjectIds: string[] };

  const teacher = await teacherService.assignSubjects(id, subjectIds);

  await auditFromRequest(req, {
    action: 'ASSIGN',
    module: MODULE,
    entityType: 'Teacher',
    entityId: id,
    description: `Assigned ${subjectIds.length} subject(s) to ${teacher.employeeId}`,
    newValue: redact({ subjectIds }),
  });

  sendSuccess(res, teacher, 'Subjects assigned successfully');
});

export const assignClass = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const body = req.body as { classId?: string | null; sectionId?: string | null };

  const teacher = await teacherService.assignClass(id, body);

  await auditFromRequest(req, {
    action: 'ASSIGN',
    module: MODULE,
    entityType: 'Teacher',
    entityId: id,
    description: `Assigned ${teacher.employeeId} as class teacher`,
    newValue: redact(body),
  });

  sendSuccess(res, teacher, 'Class assigned successfully');
});

export const addSalaryRecord = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const teacher = await teacherService.addSalaryRecord(id, req.body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'TeacherSalary',
    entityId: id,
    description: `Recorded a salary revision for ${teacher.employeeId}`,
    // Amounts are intentionally not written to the audit trail.
  });

  sendCreated(res, teacher, 'Salary record added successfully');
});

export const changeStatus = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const { status } = req.body as { status: never };

  const teacher = await teacherService.changeTeacherStatus(id, status);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Teacher',
    entityId: id,
    description: `Changed status of ${teacher.employeeId} to ${teacher.status}`,
    newValue: redact({ status: teacher.status }),
  });

  sendSuccess(res, teacher, 'Teacher status updated successfully');
});

export const deleteTeacher = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const before = await teacherService.getTeacher(id);

  await teacherService.deleteTeacher(id);

  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'Teacher',
    entityId: id,
    description: `Removed teacher ${before.employeeId}`,
    oldValue: redact(before),
  });

  sendSuccess(res, null, 'Teacher removed successfully');
});

export const uploadPhoto = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = paramId(req);

  if (!req.file) {
    throw new BadRequestError('Select a photo to upload', [
      { field: 'photo', message: 'No file was received' },
    ]);
  }

  const before = await teacherService.getTeacher(id);
  const asset = await persistFileAsset({
    file: req.file,
    category: 'TEACHERS',
    uploadedById: user.id,
  });

  const teacher = await teacherService.updateTeacherPhoto(id, asset.id);

  if (before.photoId) {
    await deleteFileAsset(before.photoId);
  }

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Teacher',
    entityId: id,
    description: `Updated photo for ${before.employeeId}`,
  });

  sendSuccess(res, teacher, 'Photo updated successfully');
});

export const exportTeachers = asyncHandler(async (req: Request, res: Response) => {
  const format = (req.query['format'] as 'csv' | 'xlsx' | undefined) ?? 'xlsx';
  const rows = await teacherService.getTeachersForExport(filtersFrom(req));

  await auditFromRequest(req, {
    action: 'EXPORT',
    module: MODULE,
    entityType: 'Teacher',
    description: `Exported ${rows.length} teacher record(s) as ${format}`,
  });

  await sendExport(res, rows, `teachers-${new Date().toISOString().slice(0, 10)}`, format, 'Teachers');
});
