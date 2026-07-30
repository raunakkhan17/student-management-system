import { Router } from 'express';
import * as controller from '@/controllers/teacher.controller';
import { authenticate } from '@/middleware/authenticate';
import { requirePermission } from '@/middleware/authorize';
import { createUploader, IMAGE_MIME_TYPES } from '@/middleware/upload';
import { validate } from '@/middleware/validate';
import { uuidParamSchema } from '@/validators/common.validator';
import {
  assignClassSchema,
  assignSubjectsSchema,
  changeTeacherStatusSchema,
  createTeacherSchema,
  salarySchema,
  teacherExportQuerySchema,
  teacherQuerySchema,
  updateTeacherSchema,
} from '@/validators/teacher.validator';

const router = Router();

router.use(authenticate);

const canView = requirePermission('TEACHERS', 'VIEW');
const canCreate = requirePermission('TEACHERS', 'CREATE');
const canEdit = requirePermission('TEACHERS', 'EDIT');
const canDelete = requirePermission('TEACHERS', 'DELETE');
const canExport = requirePermission('TEACHERS', 'EXPORT');
const canAssign = requirePermission('TEACHERS', 'ASSIGN');

const photoUpload = createUploader({
  category: 'TEACHERS',
  allowedMimeTypes: IMAGE_MIME_TYPES,
  maxSizeBytes: 2 * 1024 * 1024,
});

router
  .route('/')
  .get(canView, validate({ query: teacherQuerySchema }), controller.listTeachers)
  .post(canCreate, validate({ body: createTeacherSchema }), controller.createTeacher);

// Static segments must precede `/:id`.
router.get('/options', canView, controller.listTeacherOptions);
router.get('/export', canExport, validate({ query: teacherExportQuerySchema }), controller.exportTeachers);

router
  .route('/:id')
  .get(canView, validate({ params: uuidParamSchema }), controller.getTeacher)
  .patch(
    canEdit,
    validate({ params: uuidParamSchema, body: updateTeacherSchema }),
    controller.updateTeacher,
  )
  .delete(canDelete, validate({ params: uuidParamSchema }), controller.deleteTeacher);

router.put(
  '/:id/subjects',
  canAssign,
  validate({ params: uuidParamSchema, body: assignSubjectsSchema }),
  controller.assignSubjects,
);

router.post(
  '/:id/assign-class',
  canAssign,
  validate({ params: uuidParamSchema, body: assignClassSchema }),
  controller.assignClass,
);

router.post(
  '/:id/salary',
  canEdit,
  validate({ params: uuidParamSchema, body: salarySchema }),
  controller.addSalaryRecord,
);

router.patch(
  '/:id/status',
  canEdit,
  validate({ params: uuidParamSchema, body: changeTeacherStatusSchema }),
  controller.changeStatus,
);

router.post(
  '/:id/photo',
  canEdit,
  validate({ params: uuidParamSchema }),
  photoUpload.single('photo'),
  controller.uploadPhoto,
);

export default router;
