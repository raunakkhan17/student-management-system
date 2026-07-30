import { Router } from 'express';
import { z } from 'zod';
import * as controller from '@/controllers/attendance.controller';
import { authenticate } from '@/middleware/authenticate';
import { requirePermission } from '@/middleware/authorize';
import { validate } from '@/middleware/validate';
import {
  attendanceReportQuerySchema,
  attendanceSessionQuerySchema,
  attendanceSheetQuerySchema,
  createHolidaySchema,
  holidayQuerySchema,
  markAttendanceSchema,
  monthlyAttendanceQuerySchema,
  studentAttendanceQuerySchema,
  updateAttendanceSchema,
  updateHolidaySchema,
} from '@/validators/attendance.validator';
import { uuidParamSchema } from '@/validators/common.validator';

const router = Router();

router.use(authenticate);

const canView = requirePermission('ATTENDANCE', 'VIEW');
const canCreate = requirePermission('ATTENDANCE', 'CREATE');
const canEdit = requirePermission('ATTENDANCE', 'EDIT');
const canExport = requirePermission('ATTENDANCE', 'EXPORT');
const canApprove = requirePermission('ATTENDANCE', 'APPROVE');

const studentIdParam = z.object({ studentId: z.string().uuid() });

// --------------------------------------------------------------- Marking flow
router.get('/sheet', canView, validate({ query: attendanceSheetQuerySchema }), controller.getSheet);
router.post('/', canCreate, validate({ body: markAttendanceSchema }), controller.markAttendance);

// ------------------------------------------------------------------- Insights
router.get('/pending', canView, controller.getPending);
router.get('/monthly', canView, validate({ query: monthlyAttendanceQuerySchema }), controller.getMonthly);
router.get('/summary/daily', canView, controller.getDailySummary);
router.get('/summary/trend', canView, controller.getTrend);
router.get('/report', canExport, validate({ query: attendanceReportQuerySchema }), controller.exportReport);

router.get(
  '/students/:studentId',
  canView,
  validate({ params: studentIdParam, query: studentAttendanceQuerySchema }),
  controller.getStudentAttendance,
);

// ------------------------------------------------------------------- Holidays
router
  .route('/holidays')
  .get(canView, validate({ query: holidayQuerySchema }), controller.listHolidays)
  .post(canCreate, validate({ body: createHolidaySchema }), controller.createHoliday);

router
  .route('/holidays/:id')
  .patch(
    canEdit,
    validate({ params: uuidParamSchema, body: updateHolidaySchema }),
    controller.updateHoliday,
  )
  .delete(requirePermission('ATTENDANCE', 'DELETE'), validate({ params: uuidParamSchema }), controller.deleteHoliday);

// ------------------------------------------------------------------- Sessions
// Declared last so static segments above are never parsed as an identifier.
router.get('/sessions', canView, validate({ query: attendanceSessionQuerySchema }), controller.listSessions);

router
  .route('/sessions/:id')
  .get(canView, validate({ params: uuidParamSchema }), controller.getSession)
  .patch(
    canEdit,
    validate({ params: uuidParamSchema, body: updateAttendanceSchema }),
    controller.updateSession,
  );

router.post('/sessions/:id/lock', canApprove, validate({ params: uuidParamSchema }), controller.lockSession);
router.post('/sessions/:id/unlock', canApprove, validate({ params: uuidParamSchema }), controller.unlockSession);

export default router;
