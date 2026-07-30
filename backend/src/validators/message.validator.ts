import { NotificationType, UserRole } from '@prisma/client';
import { z } from 'zod';
import { optionalString, paginationQuerySchema, requiredString } from './common.validator';

export const startConversationSchema = z
  .object({
    /** Everyone in the thread besides the sender. */
    participantIds: z
      .array(z.string().uuid())
      .min(1, 'Choose at least one recipient')
      .max(50, 'A conversation may hold at most 50 people'),
    subject: optionalString(200),
    body: requiredString('Message', 5000),
    attachmentIds: z.array(z.string().uuid()).max(10).default([]),
  })
  .refine((data) => new Set(data.participantIds).size === data.participantIds.length, {
    message: 'The same person was added twice',
    path: ['participantIds'],
  });

export const sendMessageSchema = z.object({
  body: requiredString('Message', 5000),
  attachmentIds: z.array(z.string().uuid()).max(10).default([]),
});

export const conversationQuerySchema = paginationQuerySchema.extend({
  /** Archived threads are hidden from the inbox by default. */
  includeArchived: z.coerce.boolean().default(false),
  onlyUnread: z.coerce.boolean().default(false),
});

export const messageQuerySchema = paginationQuerySchema.extend({
  /** Messages before this instant, for scrolling back through a thread. */
  before: z.coerce.date().optional(),
});

export const updateParticipationSchema = z
  .object({
    isArchived: z.boolean().optional(),
    isMuted: z.boolean().optional(),
  })
  .refine((data) => data.isArchived !== undefined || data.isMuted !== undefined, {
    message: 'Nothing to update',
  });

export const recipientQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  role: z.nativeEnum(UserRole).optional(),
});

// ------------------------------------------------------------- Notifications

export const notificationQuerySchema = paginationQuerySchema.extend({
  onlyUnread: z.coerce.boolean().default(false),
  type: z.nativeEnum(NotificationType).optional(),
});

export const notificationSettingsSchema = z.object({
  preferences: z
    .array(
      z.object({
        type: z.nativeEnum(NotificationType),
        inAppEnabled: z.boolean(),
        emailEnabled: z.boolean(),
      }),
    )
    .min(1)
    .max(20),
});

export type StartConversationInput = z.infer<typeof startConversationSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type NotificationSettingsInput = z.infer<typeof notificationSettingsSchema>;
