import type { Request, Response } from 'express';
import { requireUser } from '@/middleware/authenticate';
import { auditFromRequest, redact } from '@/services/audit.service';
import * as timetableService from '@/services/timetable/timetable.service';
import { ForbiddenError, NotFoundError } from '@/utils/api-error';
import { sendCreated, sendPaginated, sendSuccess } from '@/utils/api-response';
import { asyncHandler } from '@/utils/async-handler';
import { buildListQuery } from '@/utils/pagination';
import type { BulkSlotsInput, CreateTimetableInput } from '@/validators/timetable.validator';

const MODULE = 'TIMETABLE' as const;

function paramId(req: Request): string {
  return req.params['id'] as string;
}

// ----------------------------------------------------------------------- Rooms

export const listRooms = asyncHandler(async (req: Request, res: Response) => {
  const query = buildListQuery(req.query, {
    allowedSortFields: timetableService.ROOM_SORT_FIELDS,
    defaultSortBy: 'name',
    defaultSortOrder: 'asc',
  });

  const { items, pagination } = await timetableService.listRooms(query, {
    type: req.query['type'] as never,
  });

  sendPaginated(res, items, pagination, 'Rooms retrieved successfully');
});

export const listRoomOptions = asyncHandler(async (_req: Request, res: Response) => {
  const options = await timetableService.listRoomOptions();
  sendSuccess(res, options, 'Room options retrieved successfully');
});

export const createRoom = asyncHandler(async (req: Request, res: Response) => {
  const room = await timetableService.createRoom(req.body);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'Room',
    entityId: room.id,
    description: `Added room ${room.name}`,
    newValue: redact(room),
  });

  sendCreated(res, room, 'Room added successfully');
});

export const updateRoom = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const room = await timetableService.updateRoom(id, req.body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Room',
    entityId: id,
    description: `Updated room ${room.name}`,
    newValue: redact(room),
  });

  sendSuccess(res, room, 'Room updated successfully');
});

export const deleteRoom = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  await timetableService.deleteRoom(id);

  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'Room',
    entityId: id,
    description: 'Removed a room',
  });

  sendSuccess(res, null, 'Room removed successfully');
});

// --------------------------------------------------------------------- Periods

export const listPeriods = asyncHandler(async (_req: Request, res: Response) => {
  const periods = await timetableService.listPeriods();
  sendSuccess(res, periods, 'Periods retrieved successfully');
});

export const createPeriod = asyncHandler(async (req: Request, res: Response) => {
  const period = await timetableService.createPeriod(req.body);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'TimetablePeriod',
    entityId: period.id,
    description: `Added period ${period.name}`,
    newValue: redact(period),
  });

  sendCreated(res, period, 'Period added successfully');
});

export const updatePeriod = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const period = await timetableService.updatePeriod(id, req.body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'TimetablePeriod',
    entityId: id,
    description: `Updated period ${period.name}`,
    newValue: redact(period),
  });

  sendSuccess(res, period, 'Period updated successfully');
});

export const deletePeriod = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  await timetableService.deletePeriod(id);

  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'TimetablePeriod',
    entityId: id,
    description: 'Removed a period',
  });

  sendSuccess(res, null, 'Period removed successfully');
});

// ------------------------------------------------------------------ Timetables

export const listTimetables = asyncHandler(async (req: Request, res: Response) => {
  const query = buildListQuery(req.query, {
    allowedSortFields: ['effectiveFrom', 'name'],
    defaultSortBy: 'effectiveFrom',
    defaultSortOrder: 'desc',
  });

  const { items, pagination } = await timetableService.listTimetables(query, {
    classId: req.query['classId'] as string | undefined,
    sectionId: req.query['sectionId'] as string | undefined,
    academicYearId: req.query['academicYearId'] as string | undefined,
    isActive: req.query['isActive'] as boolean | undefined,
  });

  sendPaginated(res, items, pagination, 'Timetables retrieved successfully');
});

export const getTimetable = asyncHandler(async (req: Request, res: Response) => {
  const timetable = await timetableService.getTimetable(paramId(req));
  sendSuccess(res, timetable, 'Timetable retrieved successfully');
});

export const createTimetable = asyncHandler(async (req: Request, res: Response) => {
  const timetable = await timetableService.createTimetable(req.body as CreateTimetableInput);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'Timetable',
    entityId: timetable.id,
    description: `Created timetable ${timetable.name} for ${timetable.class.name} — ${timetable.section.name}`,
    newValue: redact({ id: timetable.id, name: timetable.name, isActive: timetable.isActive }),
  });

  sendCreated(res, timetable, 'Timetable created successfully');
});

export const updateTimetable = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const timetable = await timetableService.updateTimetable(id, req.body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Timetable',
    entityId: id,
    description: `Updated timetable ${timetable.name}`,
    newValue: redact({ name: timetable.name, isActive: timetable.isActive }),
  });

  sendSuccess(res, timetable, 'Timetable updated successfully');
});

export const deleteTimetable = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  await timetableService.deleteTimetable(id);

  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'Timetable',
    entityId: id,
    description: 'Deleted a timetable',
  });

  sendSuccess(res, null, 'Timetable deleted successfully');
});

export const replaceSlots = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const body = req.body as BulkSlotsInput;

  const timetable = await timetableService.replaceSlots(id, body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Timetable',
    entityId: id,
    description: `Saved ${body.slots.length} slot(s) for ${timetable.name}`,
    newValue: redact({ slotCount: body.slots.length }),
  });

  sendSuccess(res, timetable, 'Timetable saved successfully');
});

export const checkConflicts = asyncHandler(async (req: Request, res: Response) => {
  const result = await timetableService.checkConflicts(paramId(req), req.body as BulkSlotsInput);
  sendSuccess(
    res,
    result,
    result.hasConflicts ? 'Conflicts found' : 'No scheduling conflicts detected',
  );
});

// ----------------------------------------------------------------- Role views

export const getTeacherTimetable = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const requestedId = req.query['teacherId'] as string | undefined;

  // Teachers implicitly see their own schedule; admins can request anyone's.
  const teacherId = user.role === 'TEACHER' ? user.teacherId : (requestedId ?? user.teacherId);

  if (!teacherId) {
    throw new NotFoundError('Teacher');
  }

  if (user.role === 'TEACHER' && requestedId && requestedId !== user.teacherId) {
    throw new ForbiddenError('You can only view your own timetable');
  }

  const slots = await timetableService.getTeacherTimetable(
    teacherId,
    req.query['academicYearId'] as string | undefined,
  );

  sendSuccess(res, slots, 'Teacher timetable retrieved successfully');
});

export const getStudentTimetable = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const studentId = req.params['studentId'] as string;

  if (user.role === 'STUDENT' && user.studentId !== studentId) {
    throw new ForbiddenError('You can only view your own timetable');
  }

  const timetable = await timetableService.getStudentTimetable(studentId);
  sendSuccess(res, timetable, 'Student timetable retrieved successfully');
});
