import { Router } from 'express';
import { z } from 'zod';
import * as controller from '@/controllers/timetable.controller';
import { authenticate } from '@/middleware/authenticate';
import { requirePermission } from '@/middleware/authorize';
import { validate } from '@/middleware/validate';
import { uuidParamSchema } from '@/validators/common.validator';
import {
  bulkSlotsSchema,
  createPeriodSchema,
  createRoomSchema,
  createTimetableSchema,
  roomQuerySchema,
  teacherTimetableQuerySchema,
  timetableQuerySchema,
  updatePeriodSchema,
  updateRoomSchema,
  updateTimetableSchema,
} from '@/validators/timetable.validator';

const router = Router();

router.use(authenticate);

const canView = requirePermission('TIMETABLE', 'VIEW');
const canCreate = requirePermission('TIMETABLE', 'CREATE');
const canEdit = requirePermission('TIMETABLE', 'EDIT');
const canDelete = requirePermission('TIMETABLE', 'DELETE');
const canAssign = requirePermission('TIMETABLE', 'ASSIGN');

const studentIdParam = z.object({ studentId: z.string().uuid() });

// ----------------------------------------------------------------------- Rooms
router
  .route('/rooms')
  .get(canView, validate({ query: roomQuerySchema }), controller.listRooms)
  .post(canCreate, validate({ body: createRoomSchema }), controller.createRoom);

router.get('/rooms/options', canView, controller.listRoomOptions);

router
  .route('/rooms/:id')
  .patch(canEdit, validate({ params: uuidParamSchema, body: updateRoomSchema }), controller.updateRoom)
  .delete(canDelete, validate({ params: uuidParamSchema }), controller.deleteRoom);

// --------------------------------------------------------------------- Periods
router
  .route('/periods')
  .get(canView, controller.listPeriods)
  .post(canCreate, validate({ body: createPeriodSchema }), controller.createPeriod);

router
  .route('/periods/:id')
  .patch(
    canEdit,
    validate({ params: uuidParamSchema, body: updatePeriodSchema }),
    controller.updatePeriod,
  )
  .delete(canDelete, validate({ params: uuidParamSchema }), controller.deletePeriod);

// ------------------------------------------------------------------ Role views
router.get('/me/teacher', canView, validate({ query: teacherTimetableQuerySchema }), controller.getTeacherTimetable);
router.get('/students/:studentId', canView, validate({ params: studentIdParam }), controller.getStudentTimetable);

// ------------------------------------------------------------------ Timetables
router
  .route('/')
  .get(canView, validate({ query: timetableQuerySchema }), controller.listTimetables)
  .post(canCreate, validate({ body: createTimetableSchema }), controller.createTimetable);

router
  .route('/:id')
  .get(canView, validate({ params: uuidParamSchema }), controller.getTimetable)
  .patch(
    canEdit,
    validate({ params: uuidParamSchema, body: updateTimetableSchema }),
    controller.updateTimetable,
  )
  .delete(canDelete, validate({ params: uuidParamSchema }), controller.deleteTimetable);

router.put(
  '/:id/slots',
  canAssign,
  validate({ params: uuidParamSchema, body: bulkSlotsSchema }),
  controller.replaceSlots,
);

/** Dry run so the grid editor can warn before the user commits. */
router.post(
  '/:id/check-conflicts',
  canView,
  validate({ params: uuidParamSchema, body: bulkSlotsSchema }),
  controller.checkConflicts,
);

export default router;
