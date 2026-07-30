import type { Request, Response } from 'express';
import { requireUser } from '@/middleware/authenticate';
import { auditFromRequest } from '@/services/audit.service';
import { discardUploadedFiles, persistFileAsset } from '@/services/file.service';
import * as messageService from '@/services/message.service';
import * as notificationService from '@/services/notification.service';
import { sendCreated, sendPaginated, sendSuccess } from '@/utils/api-response';
import { asyncHandler } from '@/utils/async-handler';
import { buildListQuery } from '@/utils/pagination';
import type {
  NotificationSettingsInput,
  SendMessageInput,
  StartConversationInput,
} from '@/validators/message.validator';

const MODULE = 'COMMUNICATION' as const;

function paramId(req: Request): string {
  return req.params['id'] as string;
}

// ------------------------------------------------------------- Conversations

export const listConversations = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const query = buildListQuery(req.query, {
    allowedSortFields: ['lastMessageAt'],
    defaultSortBy: 'lastMessageAt',
    defaultSortOrder: 'desc',
  });

  const { items, pagination } = await messageService.listConversations(user, query, {
    includeArchived: req.query['includeArchived'] as boolean | undefined,
    onlyUnread: req.query['onlyUnread'] as boolean | undefined,
  });

  sendPaginated(res, items, pagination, 'Conversations retrieved successfully');
});

export const getConversation = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const conversation = await messageService.getConversation(paramId(req), user);
  sendSuccess(res, conversation, 'Conversation retrieved successfully');
});

export const startConversation = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const body = req.body as StartConversationInput;

  const conversation = await messageService.startConversation(body, user);

  await auditFromRequest(req, {
    action: 'CREATE',
    module: MODULE,
    entityType: 'Conversation',
    entityId: conversation.id,
    description: `Started a conversation with ${body.participantIds.length} recipient(s)`,
  });

  sendCreated(res, conversation, 'Message sent successfully');
});

export const listMessages = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const query = buildListQuery(req.query, {
    allowedSortFields: ['sentAt'],
    defaultSortBy: 'sentAt',
    defaultSortOrder: 'desc',
  });

  const { items, pagination } = await messageService.listMessages(
    paramId(req),
    user,
    query,
    req.query['before'] as Date | undefined,
  );

  sendPaginated(res, items, pagination, 'Messages retrieved successfully');
});

export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const message = await messageService.sendMessage(
    paramId(req),
    req.body as SendMessageInput,
    user,
  );

  sendCreated(res, message, 'Message sent successfully');
});

export const markConversationRead = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const result = await messageService.markConversationRead(paramId(req), user.id);
  sendSuccess(res, result, 'Conversation marked as read');
});

export const updateParticipation = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const result = await messageService.updateParticipation(paramId(req), user.id, req.body);
  sendSuccess(res, result, 'Conversation updated successfully');
});

export const deleteMessage = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const messageId = req.params['messageId'] as string;

  await messageService.deleteMessage(messageId, user);

  await auditFromRequest(req, {
    action: 'DELETE',
    module: MODULE,
    entityType: 'Message',
    entityId: messageId,
    description: 'Deleted a message',
  });

  sendSuccess(res, null, 'Message deleted');
});

export const uploadAttachments = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];

  if (files.length === 0) {
    sendSuccess(res, [], 'No files were uploaded');
    return;
  }

  try {
    const assets = await Promise.all(
      files.map((file) => persistFileAsset({ file, category: 'MESSAGES', uploadedById: user.id })),
    );

    sendCreated(
      res,
      assets.map((asset) => ({
        id: asset.id,
        originalName: asset.originalName,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
      })),
      'Attachments uploaded successfully',
    );
  } catch (error) {
    await discardUploadedFiles(files);
    throw error;
  }
});

export const listRecipients = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);

  const recipients = await messageService.listRecipients(user, {
    search: req.query['search'] as string | undefined,
    role: req.query['role'] as never,
  });

  sendSuccess(res, recipients, 'Recipients retrieved successfully');
});

export const getUnreadCount = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);

  const [messages, notifications] = await Promise.all([
    messageService.countUnreadMessages(user.id),
    notificationService.countUnread(user.id),
  ]);

  sendSuccess(res, { messages, notifications }, 'Unread counts retrieved successfully');
});

// ------------------------------------------------------------- Notifications

export const listNotifications = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const query = buildListQuery(req.query, {
    allowedSortFields: ['createdAt'],
    defaultSortBy: 'createdAt',
    defaultSortOrder: 'desc',
  });

  const { items, pagination } = await notificationService.listNotifications(user.id, query, {
    onlyUnread: req.query['onlyUnread'] as boolean | undefined,
    type: req.query['type'] as never,
  });

  sendPaginated(res, items, pagination, 'Notifications retrieved successfully');
});

export const markNotificationRead = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const notification = await notificationService.markRead(paramId(req), user.id);
  sendSuccess(res, notification, 'Notification marked as read');
});

export const markAllNotificationsRead = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const result = await notificationService.markAllRead(user.id);
  sendSuccess(res, result, `${result.updated} notification(s) marked as read`);
});

export const getNotificationSettings = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const preferences = await notificationService.getPreferences(user.id);
  sendSuccess(res, preferences, 'Notification settings retrieved successfully');
});

export const saveNotificationSettings = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const body = req.body as NotificationSettingsInput;

  const preferences = await notificationService.savePreferences(user.id, body.preferences);

  sendSuccess(res, preferences, 'Notification settings saved successfully');
});
