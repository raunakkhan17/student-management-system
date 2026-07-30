import type { Request, Response } from 'express';
import { prisma } from '@/config/prisma';
import { requireUser } from '@/middleware/authenticate';
import { auditFromRequest, redact } from '@/services/audit.service';
import * as attendanceService from '@/services/attendance.service';
import * as holidayService from '@/services/holiday.service';
import { ForbiddenError } from '@/utils/api-error';
import { sendCreated, sendPaginated, sendSuccess } from '@/utils/api-response';
import { asyncHandler } from '@/utils/async-handler';
import { sendExport } from '@/utils/export';
import { buildListQuery } from '@/utils/pagination';
import type {
  MarkAttendanceInput,
  UpdateAttendanceInput,
} from '@/validators/attendance.validator';

const MODULE = 'ATTENDANCE' as const;

function paramId(req: Request): string {
  return req.params['id'] as string;
}

export const getSheet = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);

  const sheet = await attendanceService.getAttendanceSheet(user, {
    classId: req.query['classId'] as string,
    sectionId: req.query['sectionId'] as string,
    ...(req.query['subjectId'] ? { subjectId: req.query['subjectId'] as string } : {}),
    ...(req.query['periodId'] ? { periodId: req.query['periodId'] as string } : {}),
    date: req.query['date'] as unknown as Date,
  });

  sendSuccess(res, sheet, 'Attendance sheet retrieved successfully');
});

export const markAttendance = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const body = req.body as MarkAttendanceInput;

  const session = await attendanceService.markAttendance(user, body);

  await auditFromRequest(req, {
    action: body.submit ? 'PUBLISH' : 'CREATE',
    module: MODULE,
    entityType: 'AttendanceSession',
    entityId: session.id,
    description: `${body.submit ? 'Submitted' : 'Saved'} attendance for ${session.class.name} — ${session.section.name} on ${session.date.toISOString().slice(0, 10)}`,
    newValue: redact({ status: session.status, markedCount: body.records.length }),
  });

  sendSuccess(
    res,
    session,
    body.submit ? 'Attendance submitted successfully' : 'Attendance saved as draft',
  );
});

export const listSessions = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const query = buildListQuery(req.query, {
    allowedSortFields: ['date'],
    defaultSortBy: 'date',
    defaultSortOrder: 'desc',
  });

  const { items, pagination } = await attendanceService.listSessions(user, query, {
    classId: req.query['classId'] as string | undefined,
    sectionId: req.query['sectionId'] as string | undefined,
    subjectId: req.query['subjectId'] as string | undefined,
    status: req.query['status'] as never,
    from: req.query['from'] as Date | undefined,
    to: req.query['to'] as Date | undefined,
  });

  sendPaginated(res, items, pagination, 'Attendance sessions retrieved successfully');
});

export const getSession = asyncHandler(async (req: Request, res: Response) => {
  const session = await attendanceService.getSession(paramId(req));
  sendSuccess(res, session, 'Attendance session retrieved successfully');
});

export const updateSession = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const body = req.body as UpdateAttendanceInput;

  const before = await attendanceService.getSession(id);
  const session = await attendanceService.updateAttendanceRecords(id, body.records, body.remarks);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'AttendanceSession',
    entityId: id,
    description: `Corrected attendance for ${session.class.name} — ${session.section.name}`,
    oldValue: redact(before.records.map((record) => ({ studentId: record.studentId, status: record.status }))),
    newValue: redact(body.records),
  });

  sendSuccess(res, session, 'Attendance updated successfully');
});

export const lockSession = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const session = await attendanceService.lockSession(id);

  await auditFromRequest(req, {
    action: 'APPROVE',
    module: MODULE,
    entityType: 'AttendanceSession',
    entityId: id,
    description: 'Locked the attendance session',
  });

  sendSuccess(res, session, 'Attendance session locked');
});

export const unlockSession = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const session = await attendanceService.unlockSession(id);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'AttendanceSession',
    entityId: id,
    description: 'Reopened the attendance session',
  });

  sendSuccess(res, session, 'Attendance session reopened');
});

export const getMonthly = asyncHandler(async (req: Request, res: Response) => {
  const summary = await attendanceService.getMonthlyAttendance({
    classId: req.query['classId'] as string | undefined,
    sectionId: req.query['sectionId'] as string | undefined,
    studentId: req.query['studentId'] as string | undefined,
    year: req.query['year'] as unknown as number,
    month: req.query['month'] as unknown as number,
  });

  sendSuccess(res, summary, 'Monthly attendance retrieved successfully');
});

export const getStudentAttendance = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const studentId = req.params['studentId'] as string;

  // Students and parents may only read their own records.
  if (user.role === 'STUDENT' && user.studentId !== studentId) {
    throw new ForbiddenError('You can only view your own attendance');
  }

  if (user.role === 'PARENT') {
    const isLinked = await prisma.studentGuardian.count({
      where: { guardianId: user.guardianId ?? '', studentId },
    });
    if (isLinked === 0) {
      throw new ForbiddenError('You can only view attendance for your own children');
    }
  }

  const attendance = await attendanceService.getStudentAttendance(studentId, {
    from: req.query['from'] as Date | undefined,
    to: req.query['to'] as Date | undefined,
  });

  sendSuccess(res, attendance, 'Attendance retrieved successfully');
});

export const getPending = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const sessions = await attendanceService.getPendingSessions(user);
  sendSuccess(res, sessions, 'Pending attendance retrieved successfully');
});

export const getDailySummary = asyncHandler(async (req: Request, res: Response) => {
  const raw = req.query['date'];
  const date = raw ? new Date(`${String(raw)}T00:00:00.000Z`) : new Date();
  const summary = await attendanceService.getDailySummary(date);
  sendSuccess(res, summary, 'Daily attendance summary retrieved successfully');
});

export const getTrend = asyncHandler(async (req: Request, res: Response) => {
  const to = req.query['to'] ? new Date(`${String(req.query['to'])}T00:00:00.000Z`) : new Date();
  const from = req.query['from']
    ? new Date(`${String(req.query['from'])}T00:00:00.000Z`)
    : new Date(to.getTime() - 29 * 86_400_000);

  const trend = await attendanceService.getAttendanceTrend(from, to);
  sendSuccess(res, trend, 'Attendance trend retrieved successfully');
});

export const exportReport = asyncHandler(async (req: Request, res: Response) => {
  const format = (req.query['format'] as 'csv' | 'xlsx' | undefined) ?? 'xlsx';

  const rows = await attendanceService.getAttendanceReportRows({
    classId: req.query['classId'] as string | undefined,
    sectionId: req.query['sectionId'] as string | undefined,
    from: req.query['from'] as unknown as Date,
    to: req.query['to'] as unknown as Date,
  });

  await auditFromRequest(req, {
    action: 'EXPORT',
    module: MODULE,
    entityType: 'AttendanceRecord',
    description: `Exported an attendance report for ${rows.length} student(s)`,
  });

  await sendExport(
    res,
    rows,
    `attendance-${new Date().toISOString().slice(0, 10)}`,
    format,
    'Attendance',
  );
});

// ------------------------------------------------------------------- Holidays

export const listHolidays = asyncHandler(async (req: Request, res: Response) => {
  const query = buildListQuery(req.query, {
    allowedSortFields: ['date', 'name'],
    defaultSortBy: 'date',
    defaultSortOrder: 'asc',
  });

  const { items, pagination } = await holidayService.listHolidays(query, {
    academicYearId: req.query['academicYearId'] as string | undefined,
    from: req.query['from'] as Date | undefined,
    to: req.query['to'] as Date | undefined,
  });

  sendPaginated(res, items, pagination, 'Holidays retrieved successfully');
});

export const createHoliday = asyncHandler(async (req: Request, res: Response) => {
  const holiday = await holidayService.createHoliday(req.body);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'Holiday',
    entityId: holiday.id,
    description: `Added holiday ${holiday.name}`,
    newValue: redact(holiday),
  });

  sendCreated(res, holiday, 'Holiday added successfully');
});

export const updateHoliday = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  const holiday = await holidayService.updateHoliday(id, req.body);

  await auditFromRequest(req, {
    action: 'UPDATE',
    module: MODULE,
    entityType: 'Holiday',
    entityId: id,
    description: `Updated holiday ${holiday.name}`,
    newValue: redact(holiday),
  });

  sendSuccess(res, holiday, 'Holiday updated successfully');
});

export const deleteHoliday = asyncHandler(async (req: Request, res: Response) => {
  const id = paramId(req);
  await holidayService.deleteHoliday(id);

  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'Holiday',
    entityId: id,
    description: 'Removed a holiday',
  });

  sendSuccess(res, null, 'Holiday removed successfully');
});
