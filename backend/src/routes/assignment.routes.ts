import { Router } from 'express';
import { z } from 'zod';
import * as controller from '@/controllers/assignment.controller';
import { authenticate } from '@/middleware/authenticate';
import { requirePermission, requireRoles } from '@/middleware/authorize';
import { createUploader } from '@/middleware/upload';
import { validate } from '@/middleware/validate';
import {
  assignmentQuerySchema,
  createAssignmentSchema,
  evaluateSubmissionSchema,
  submissionQuerySchema,
  submitAssignmentSchema,
  updateAssignmentSchema,
} from '@/validators/assignment.validator';
import { uuidParamSchema } from '@/validators/common.validator';

const router = Router();

router.use(authenticate);

const canView = requirePermission('ASSIGNMENTS', 'VIEW');
const canCreate = requirePermission('ASSIGNMENTS', 'CREATE');
const canEdit = requirePermission('ASSIGNMENTS', 'EDIT');
const canDelete = requirePermission('ASSIGNMENTS', 'DELETE');
const canApprove = requirePermission('ASSIGNMENTS', 'APPROVE');

const upload = createUploader({ category: 'ASSIGNMENTS' });
const submissionParam = uuidParamSchema.extend({ submissionId: z.string().uuid() });

router.get('/stats', canView, controller.getStats);

router
  .route('/')
  .get(canView, validate({ query: assignmentQuerySchema }), controller.listAssignments)
  .post(
    canCreate,
    requireRoles('TEACHER', 'ADMIN', 'SUPER_ADMIN'),
    // Files are parsed before validation so multipart text fields reach Zod.
    upload.array('attachments', 10),
    validate({ body: createAssignmentSchema }),
    controller.createAssignment,
  );

router
  .route('/:id')
  .get(canView, validate({ params: uuidParamSchema }), controller.getAssignment)
  .patch(
    canEdit,
    validate({ params: uuidParamSchema, body: updateAssignmentSchema }),
    controller.updateAssignment,
  )
  .delete(canDelete, validate({ params: uuidParamSchema }), controller.deleteAssignment);

router.post(
  '/:id/attachments',
  canEdit,
  validate({ params: uuidParamSchema }),
  upload.array('attachments', 10),
  controller.uploadAttachments,
);

// ---------------------------------------------------------------- Submissions
router.post(
  '/:id/submit',
  requireRoles('STUDENT'),
  validate({ params: uuidParamSchema }),
  upload.array('attachments', 10),
  validate({ body: submitAssignmentSchema }),
  controller.submitAssignment,
);

router.get(
  '/:id/my-submission',
  requireRoles('STUDENT'),
  validate({ params: uuidParamSchema }),
  controller.getMySubmission,
);

router.get(
  '/:id/submissions',
  canView,
  validate({ params: uuidParamSchema, query: submissionQuerySchema }),
  controller.listSubmissions,
);

router.post(
  '/:id/submissions/:submissionId/evaluate',
  canApprove,
  validate({ params: submissionParam, body: evaluateSubmissionSchema }),
  controller.evaluateSubmission,
);

export default router;
