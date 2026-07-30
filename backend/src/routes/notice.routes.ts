import { Router } from 'express';
import * as controller from '@/controllers/notice.controller';
import { authenticate } from '@/middleware/authenticate';
import { requirePermission } from '@/middleware/authorize';
import { createUploader } from '@/middleware/upload';
import { validate } from '@/middleware/validate';
import { uuidParamSchema } from '@/validators/common.validator';
import {
  announcementSchema,
  createNoticeSchema,
  noticeAttachmentParamSchema,
  noticeQuerySchema,
  pinNoticeSchema,
  publishNoticeSchema,
  updateNoticeSchema,
} from '@/validators/notice.validator';

const router = Router();

router.use(authenticate);

const canView = requirePermission('NOTICES', 'VIEW');
const canCreate = requirePermission('NOTICES', 'CREATE');
const canEdit = requirePermission('NOTICES', 'EDIT');
const canDelete = requirePermission('NOTICES', 'DELETE');
const canApprove = requirePermission('NOTICES', 'APPROVE');

const upload = createUploader({ category: 'NOTICES' });

router.get('/stats', canView, controller.getStats);
router.post('/run-schedule', canEdit, controller.runSchedule);

router.post(
  '/announcements',
  canApprove,
  validate({ body: announcementSchema }),
  controller.sendAnnouncement,
);

router
  .route('/')
  .get(canView, validate({ query: noticeQuerySchema }), controller.listNotices)
  .post(canCreate, validate({ body: createNoticeSchema }), controller.createNotice);

router
  .route('/:id')
  .get(canView, validate({ params: uuidParamSchema }), controller.getNotice)
  .patch(canEdit, validate({ params: uuidParamSchema, body: updateNoticeSchema }), controller.updateNotice)
  .delete(canDelete, validate({ params: uuidParamSchema }), controller.deleteNotice);

router.post(
  '/:id/publish',
  canApprove,
  validate({ params: uuidParamSchema, body: publishNoticeSchema }),
  controller.publishNotice,
);

router.post(
  '/:id/pin',
  canEdit,
  validate({ params: uuidParamSchema, body: pinNoticeSchema }),
  controller.setPinned,
);

router.post('/:id/read', canView, validate({ params: uuidParamSchema }), controller.markRead);

router.post(
  '/:id/attachments',
  canEdit,
  validate({ params: uuidParamSchema }),
  upload.array('attachments', 10),
  controller.uploadAttachments,
);

router.delete(
  '/:id/attachments/:fileId',
  canEdit,
  validate({ params: noticeAttachmentParamSchema }),
  controller.removeAttachment,
);

export default router;
