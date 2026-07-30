import { NoticeCategory, NoticeStatus, Priority, UserRole } from '@prisma/client';
import { z } from 'zod';
import {
  csvToArray,
  optionalString,
  paginationQuerySchema,
  requiredString,
} from './common.validator';

/**
 * One audience rule. An empty `audiences` array means the notice is for everyone;
 * a rule with only a role targets that role, and a rule with a class or section
 * targets the students in it.
 */
const audienceSchema = z
  .object({
    role: z.nativeEnum(UserRole).nullish(),
    classId: z.string().uuid().nullish(),
    sectionId: z.string().uuid().nullish(),
  })
  .refine((data) => Boolean(data.role) || Boolean(data.classId) || Boolean(data.sectionId), {
    message: 'Choose a role, a class or a section',
  });

export const createNoticeSchema = z
  .object({
    title: requiredString('Title', 200),
    content: requiredString('Content', 20_000),
    category: z.nativeEnum(NoticeCategory).default('GENERAL'),
    priority: z.nativeEnum(Priority).default('MEDIUM'),
    isPinned: z.boolean().default(false),
    /** Set to publish later; the notice sits in SCHEDULED until then. */
    publishAt: z.coerce.date().nullish(),
    expiresAt: z.coerce.date().nullish(),
    /** Empty targets everybody. */
    audiences: z.array(audienceSchema).max(50).default([]),
    /** Ids of files already uploaded through the attachment endpoint. */
    attachmentIds: z.array(z.string().uuid()).max(10).default([]),
    /** Publish immediately instead of saving a draft. */
    publishNow: z.boolean().default(false),
  })
  .refine(
    (data) => !data.publishAt || !data.expiresAt || data.expiresAt > data.publishAt,
    { message: 'The expiry must be after the publish date', path: ['expiresAt'] },
  );

export const updateNoticeSchema = z.object({
  title: requiredString('Title', 200).optional(),
  content: requiredString('Content', 20_000).optional(),
  category: z.nativeEnum(NoticeCategory).optional(),
  priority: z.nativeEnum(Priority).optional(),
  isPinned: z.boolean().optional(),
  publishAt: z.coerce.date().nullish(),
  expiresAt: z.coerce.date().nullish(),
  audiences: z.array(audienceSchema).max(50).optional(),
});

export const noticeQuerySchema = paginationQuerySchema.extend({
  category: z.nativeEnum(NoticeCategory).optional(),
  status: csvToArray(z.nativeEnum(NoticeStatus)),
  priority: z.nativeEnum(Priority).optional(),
  /** Only notices the caller has not opened yet. */
  onlyUnread: z.coerce.boolean().default(false),
  onlyPinned: z.coerce.boolean().default(false),
});

export const pinNoticeSchema = z.object({
  isPinned: z.boolean(),
});

export const publishNoticeSchema = z.object({
  /** Overrides the stored schedule; omit to publish now. */
  publishAt: z.coerce.date().nullish(),
  expiresAt: z.coerce.date().nullish(),
  /** Skips the notification fan-out, e.g. when correcting a typo. */
  silent: z.boolean().default(false),
});

export const noticeAttachmentParamSchema = z.object({
  id: z.string().uuid(),
  fileId: z.string().uuid(),
});

export const announcementSchema = z.object({
  title: requiredString('Title', 200),
  body: requiredString('Message', 2000),
  roles: z.array(z.nativeEnum(UserRole)).max(7).default([]),
  link: optionalString(300),
});

export type CreateNoticeInput = z.infer<typeof createNoticeSchema>;
export type UpdateNoticeInput = z.infer<typeof updateNoticeSchema>;
export type PublishNoticeInput = z.infer<typeof publishNoticeSchema>;
export type AnnouncementInput = z.infer<typeof announcementSchema>;
