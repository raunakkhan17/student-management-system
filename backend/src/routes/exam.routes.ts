import { Router } from 'express';
import { z } from 'zod';
import * as controller from '@/controllers/exam.controller';
import { authenticate } from '@/middleware/authenticate';
import { requirePermission } from '@/middleware/authorize';
import { validate } from '@/middleware/validate';
import { uuidParamSchema } from '@/validators/common.validator';
import {
  createExamSchema,
  createGradeScaleSchema,
  enterMarksSchema,
  examQuerySchema,
  examReportQuerySchema,
  examScheduleSchema,
  publishResultsSchema,
  reportCardQuerySchema,
  updateExamScheduleSchema,
  updateExamSchema,
  updateGradeScaleSchema,
} from '@/validators/exam.validator';

const router = Router();

router.use(authenticate);

const canView = requirePermission('EXAMS', 'VIEW');
const canCreate = requirePermission('EXAMS', 'CREATE');
const canEdit = requirePermission('EXAMS', 'EDIT');
const canDelete = requirePermission('EXAMS', 'DELETE');
const canApprove = requirePermission('EXAMS', 'APPROVE');

const scheduleParam = uuidParamSchema.extend({ scheduleId: z.string().uuid() });
const scheduleOnlyParam = z.object({ scheduleId: z.string().uuid() });
const resultParam = z.object({ studentId: z.string().uuid(), examId: z.string().uuid() });

// ----------------------------------------------------------------- Reports
// Static segment, so it must precede `/:id`.
router.get(
  '/reports/results',
  requirePermission('EXAMS', 'EXPORT'),
  validate({ query: examReportQuerySchema }),
  controller.exportResults,
);

// ------------------------------------------------------------- Grade scales
// Declared before `/:id` so "grade-scales" is not read as an exam identifier.
router
  .route('/grade-scales')
  .get(canView, controller.listGradeScales)
  .post(
    requirePermission('SETTINGS', 'EDIT'),
    validate({ body: createGradeScaleSchema }),
    controller.createGradeScale,
  );

router
  .route('/grade-scales/:id')
  .get(canView, validate({ params: uuidParamSchema }), controller.getGradeScale)
  .patch(
    requirePermission('SETTINGS', 'EDIT'),
    validate({ params: uuidParamSchema, body: updateGradeScaleSchema }),
    controller.updateGradeScale,
  )
  .delete(
    requirePermission('SETTINGS', 'EDIT'),
    validate({ params: uuidParamSchema }),
    controller.deleteGradeScale,
  );

// ------------------------------------------------------------- Report cards
router.get('/report-cards', canView, validate({ query: reportCardQuerySchema }), controller.listReportCards);
router.get('/report-cards/:id', canView, validate({ params: uuidParamSchema }), controller.getReportCard);

router.get(
  '/results/:studentId/:examId',
  canView,
  validate({ params: resultParam }),
  controller.getStudentResult,
);

// -------------------------------------------------------------------- Marks
router
  .route('/papers/:scheduleId/marks')
  .get(canView, validate({ params: scheduleOnlyParam }), controller.getMarksSheet)
  .put(canEdit, validate({ params: scheduleOnlyParam, body: enterMarksSchema }), controller.enterMarks);

// -------------------------------------------------------------------- Exams
router
  .route('/')
  .get(canView, validate({ query: examQuerySchema }), controller.listExams)
  .post(canCreate, validate({ body: createExamSchema }), controller.createExam);

router
  .route('/:id')
  .get(canView, validate({ params: uuidParamSchema }), controller.getExam)
  .patch(canEdit, validate({ params: uuidParamSchema, body: updateExamSchema }), controller.updateExam)
  .delete(canDelete, validate({ params: uuidParamSchema }), controller.deleteExam);

router.post(
  '/:id/schedules',
  canCreate,
  validate({ params: uuidParamSchema, body: examScheduleSchema }),
  controller.addSchedule,
);

router
  .route('/:id/schedules/:scheduleId')
  .patch(
    canEdit,
    validate({ params: scheduleParam, body: updateExamScheduleSchema }),
    controller.updateSchedule,
  )
  .delete(canDelete, validate({ params: scheduleParam }), controller.deleteSchedule);

router.get('/:id/progress', canView, validate({ params: uuidParamSchema }), controller.getMarksProgress);
router.get('/:id/rankings', canView, validate({ params: uuidParamSchema }), controller.getRankings);
router.get('/:id/statistics', canView, validate({ params: uuidParamSchema }), controller.getStatistics);

router.post(
  '/:id/publish',
  canApprove,
  validate({ params: uuidParamSchema, body: publishResultsSchema }),
  controller.publishResults,
);

router.post(
  '/:id/withdraw',
  canApprove,
  validate({ params: uuidParamSchema }),
  controller.withdrawResults,
);

export default router;
