import { Router } from 'express';
import { z } from 'zod';
import * as controller from '@/controllers/student.controller';
import { authenticate } from '@/middleware/authenticate';
import { requirePermission } from '@/middleware/authorize';
import { createUploader, IMAGE_MIME_TYPES } from '@/middleware/upload';
import { validate } from '@/middleware/validate';
import { uuidParamSchema } from '@/validators/common.validator';
import {
  changeStatusSchema,
  createStudentSchema,
  guardianLinkSchema,
  promoteStudentsSchema,
  studentExportQuerySchema,
  studentQuerySchema,
  timelineEventSchema,
  transferStudentSchema,
  updateStudentSchema,
} from '@/validators/student.validator';

const router = Router();

router.use(authenticate);

const canView = requirePermission('STUDENTS', 'VIEW');
const canCreate = requirePermission('STUDENTS', 'CREATE');
const canEdit = requirePermission('STUDENTS', 'EDIT');
const canDelete = requirePermission('STUDENTS', 'DELETE');
const canExport = requirePermission('STUDENTS', 'EXPORT');
const canApprove = requirePermission('STUDENTS', 'APPROVE');

// Photos are capped well below the general upload limit.
const photoUpload = createUploader({
  category: 'STUDENTS',
  allowedMimeTypes: IMAGE_MIME_TYPES,
  maxSizeBytes: 2 * 1024 * 1024,
});

const guardianParamSchema = uuidParamSchema.extend({ guardianId: z.string().uuid() });

router
  .route('/')
  .get(canView, validate({ query: studentQuerySchema }), controller.listStudents)
  .post(canCreate, validate({ body: createStudentSchema }), controller.createStudent);

// Declared before `/:id` so "export" is not parsed as an identifier.
router.get('/export', canExport, validate({ query: studentExportQuerySchema }), controller.exportStudents);

router.post(
  '/promote',
  canApprove,
  validate({ body: promoteStudentsSchema }),
  controller.promoteStudents,
);

router
  .route('/:id')
  .get(canView, validate({ params: uuidParamSchema }), controller.getStudent)
  .patch(
    canEdit,
    validate({ params: uuidParamSchema, body: updateStudentSchema }),
    controller.updateStudent,
  )
  .delete(canDelete, validate({ params: uuidParamSchema }), controller.deleteStudent);

router.post(
  '/:id/transfer',
  canEdit,
  validate({ params: uuidParamSchema, body: transferStudentSchema }),
  controller.transferStudent,
);

router.patch(
  '/:id/status',
  canEdit,
  validate({ params: uuidParamSchema, body: changeStatusSchema }),
  controller.changeStatus,
);

router.post(
  '/:id/photo',
  canEdit,
  validate({ params: uuidParamSchema }),
  photoUpload.single('photo'),
  controller.uploadPhoto,
);

router
  .route('/:id/timeline')
  .get(canView, validate({ params: uuidParamSchema }), controller.getTimeline)
  .post(
    canEdit,
    validate({ params: uuidParamSchema, body: timelineEventSchema }),
    controller.addTimelineEvent,
  );

router.post(
  '/:id/guardians',
  canEdit,
  validate({ params: uuidParamSchema, body: guardianLinkSchema }),
  controller.addGuardian,
);

router.delete(
  '/:id/guardians/:guardianId',
  canEdit,
  validate({ params: guardianParamSchema }),
  controller.removeGuardian,
);

router.get('/:id/id-card', canView, validate({ params: uuidParamSchema }), controller.getIdCard);

export default router;
