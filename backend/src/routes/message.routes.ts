import { Router } from 'express';
import { z } from 'zod';
import * as controller from '@/controllers/message.controller';
import { authenticate } from '@/middleware/authenticate';
import { requirePermission } from '@/middleware/authorize';
import { createUploader } from '@/middleware/upload';
import { validate } from '@/middleware/validate';
import { uuidParamSchema } from '@/validators/common.validator';
import {
  conversationQuerySchema,
  messageQuerySchema,
  notificationQuerySchema,
  notificationSettingsSchema,
  recipientQuerySchema,
  sendMessageSchema,
  startConversationSchema,
  updateParticipationSchema,
} from '@/validators/message.validator';

const router = Router();

router.use(authenticate);

const canView = requirePermission('COMMUNICATION', 'VIEW');
const canCreate = requirePermission('COMMUNICATION', 'CREATE');

const upload = createUploader({ category: 'MESSAGES' });

const messageParamSchema = z.object({
  id: z.string().uuid(),
  messageId: z.string().uuid(),
});

// ------------------------------------------------------------- Notifications
// Declared before `/conversations/:id` so the literal segments always win.

router
  .route('/notification-settings')
  .get(controller.getNotificationSettings)
  .put(validate({ body: notificationSettingsSchema }), controller.saveNotificationSettings);

router.get(
  '/notifications',
  validate({ query: notificationQuerySchema }),
  controller.listNotifications,
);

router.post('/notifications/read-all', controller.markAllNotificationsRead);

router.post(
  '/notifications/:id/read',
  validate({ params: uuidParamSchema }),
  controller.markNotificationRead,
);

/** Powers the topbar badges; every signed-in user may read their own counts. */
router.get('/unread-count', controller.getUnreadCount);

// ------------------------------------------------------------- Conversations

router.get(
  '/recipients',
  canCreate,
  validate({ query: recipientQuerySchema }),
  controller.listRecipients,
);

router.post('/attachments', canCreate, upload.array('attachments', 10), controller.uploadAttachments);

router
  .route('/conversations')
  .get(canView, validate({ query: conversationQuerySchema }), controller.listConversations)
  .post(canCreate, validate({ body: startConversationSchema }), controller.startConversation);

router
  .route('/conversations/:id')
  .get(canView, validate({ params: uuidParamSchema }), controller.getConversation)
  .patch(
    canView,
    validate({ params: uuidParamSchema, body: updateParticipationSchema }),
    controller.updateParticipation,
  );

router
  .route('/conversations/:id/messages')
  .get(canView, validate({ params: uuidParamSchema, query: messageQuerySchema }), controller.listMessages)
  .post(canCreate, validate({ params: uuidParamSchema, body: sendMessageSchema }), controller.sendMessage);

router.post(
  '/conversations/:id/read',
  canView,
  validate({ params: uuidParamSchema }),
  controller.markConversationRead,
);

router.delete(
  '/conversations/:id/messages/:messageId',
  canView,
  validate({ params: messageParamSchema }),
  controller.deleteMessage,
);

export default router;
