import { Router } from 'express';
import * as controller from '@/controllers/document.controller';
import { authenticate } from '@/middleware/authenticate';
import { requirePermission } from '@/middleware/authorize';
import { createUploader } from '@/middleware/upload';
import { validate } from '@/middleware/validate';
import { uuidParamSchema } from '@/validators/common.validator';
import {
  documentQuerySchema,
  updateDocumentSchema,
  uploadDocumentSchema,
  verifyDocumentSchema,
} from '@/validators/document.validator';

const router = Router();

router.use(authenticate);

const canView = requirePermission('DOCUMENTS', 'VIEW');
const canCreate = requirePermission('DOCUMENTS', 'CREATE');
const canEdit = requirePermission('DOCUMENTS', 'EDIT');
const canApprove = requirePermission('DOCUMENTS', 'APPROVE');

const upload = createUploader({ category: 'DOCUMENTS' });

router.get('/stats', canView, controller.getStats);
router.get('/expiring', canView, controller.listExpiring);

router
  .route('/')
  .get(canView, validate({ query: documentQuerySchema }), controller.listDocuments)
  // The body arrives as multipart, so validation runs after multer has parsed it.
  .post(canCreate, upload.single('file'), validate({ body: uploadDocumentSchema }), controller.uploadDocument);

router
  .route('/:id')
  .get(canView, validate({ params: uuidParamSchema }), controller.getDocument)
  .patch(canEdit, validate({ params: uuidParamSchema, body: updateDocumentSchema }), controller.updateDocument)
  // Owners may withdraw their own pending upload, so this is gated in the service.
  .delete(canView, validate({ params: uuidParamSchema }), controller.deleteDocument);

router.post(
  '/:id/verify',
  canApprove,
  validate({ params: uuidParamSchema, body: verifyDocumentSchema }),
  controller.verifyDocument,
);

export default router;
