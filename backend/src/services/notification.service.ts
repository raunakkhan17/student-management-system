import { Prisma, type NotificationType } from '@prisma/client';
import { prisma } from '@/config/prisma';
import { logger } from '@/config/logger';
import type { ListQueryOptions, PaginatedData } from '@/types/api';
import { NotFoundError } from '@/utils/api-error';
import { buildPaginationMeta } from '@/utils/pagination';
import { renderStoredTemplate, sendEmail } from './email.service';

/** Every notification type, used to render the settings screen. */
export const NOTIFICATION_TYPES: readonly NotificationType[] = [
  'FEE_DUE',
  'EXAM_REMINDER',
  'ASSIGNMENT_DUE',
  'LEAVE_APPROVED',
  'LEAVE_REJECTED',
  'NEW_NOTICE',
  'LIBRARY_DUE',
  'NEW_MESSAGE',
  'RESULT_PUBLISHED',
  'ATTENDANCE_ALERT',
  'GENERAL',
];

export interface NotifyInput {
  userIds: readonly string[];
  type: NotificationType;
  title: string;
  body: string;
  /** In-app deep link, e.g. `/leave`. */
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /**
   * Stored email template key. When set, recipients who allow email for this
   * type also receive a message rendered from that template.
   */
  emailTemplateKey?: string;
  /** Variables for the email template, merged with `title` and `body`. */
  emailVariables?: Record<string, string>;
}

/**
 * Resolves which recipients want a notification of this type, in app and by email.
 *
 * A missing `NotificationSetting` row means "not yet customised", which defaults
 * to enabled — so a new notification type reaches people without a backfill.
 */
async function resolvePreferences(
  userIds: readonly string[],
  type: NotificationType,
): Promise<{ inApp: string[]; email: { id: string; email: string }[] }> {
  if (userIds.length === 0) return { inApp: [], email: [] };

  const [users, settings] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: [...userIds] }, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, email: true },
    }),
    prisma.notificationSetting.findMany({
      where: { userId: { in: [...userIds] }, type },
      select: { userId: true, inAppEnabled: true, emailEnabled: true },
    }),
  ]);

  const byUser = new Map(settings.map((row) => [row.userId, row]));

  const inApp: string[] = [];
  const email: { id: string; email: string }[] = [];

  for (const user of users) {
    const preference = byUser.get(user.id);
    if (preference?.inAppEnabled !== false) inApp.push(user.id);
    if (preference?.emailEnabled !== false) email.push({ id: user.id, email: user.email });
  }

  return { inApp, email };
}

/**
 * Fans a notification out to many users.
 *
 * In-app rows are written in one `createMany` so a notice aimed at every student
 * is a single statement. Email is best-effort and never propagates: a mail
 * failure must not fail the request that triggered the notification.
 */
export async function notify(input: NotifyInput): Promise<{ delivered: number; emailed: number }> {
  const recipients = Array.from(new Set(input.userIds));
  if (recipients.length === 0) return { delivered: 0, emailed: 0 };

  const { inApp, email } = await resolvePreferences(recipients, input.type);

  if (inApp.length > 0) {
    await prisma.notification.createMany({
      data: inApp.map((userId) => ({
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
      })),
    });
  }

  let emailed = 0;

  if (input.emailTemplateKey && email.length > 0) {
    const rendered = await renderStoredTemplate(input.emailTemplateKey, {
      title: input.title,
      body: input.body,
      ...input.emailVariables,
    });

    if (rendered) {
      const results = await Promise.all(
        email.map((recipient) =>
          sendEmail({
            to: recipient.email,
            subject: rendered.subject,
            html: rendered.html,
            templateId: rendered.id,
          }),
        ),
      );
      emailed = results.filter(Boolean).length;
    } else {
      logger.warn('Email template missing or inactive', { key: input.emailTemplateKey });
    }
  }

  return { delivered: inApp.length, emailed };
}

/**
 * Sends a notification whose email body differs per recipient.
 *
 * Used where the message names the individual, e.g. a leave decision.
 */
export async function notifyOne(
  userId: string,
  input: Omit<NotifyInput, 'userIds'>,
): Promise<void> {
  await notify({ ...input, userIds: [userId] });
}

const notificationSelect = {
  id: true,
  type: true,
  title: true,
  body: true,
  link: true,
  entityType: true,
  entityId: true,
  isRead: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

export type NotificationRecord = Prisma.NotificationGetPayload<{
  select: typeof notificationSelect;
}>;

export async function listNotifications(
  userId: string,
  query: ListQueryOptions,
  filters: { onlyUnread?: boolean; type?: NotificationType },
): Promise<PaginatedData<NotificationRecord>> {
  const where: Prisma.NotificationWhereInput = {
    userId,
    ...(filters.onlyUnread ? { isRead: false } : {}),
    ...(filters.type ? { type: filters.type } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.notification.findMany({
      where,
      select: notificationSelect,
      orderBy: { createdAt: 'desc' },
      skip: query.skip,
      take: query.take,
    }),
    prisma.notification.count({ where }),
  ]);

  return { items, pagination: buildPaginationMeta(totalItems, query) };
}

export async function countUnread(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, isRead: false } });
}

/** Marks one notification read. Scoped to the owner so ids cannot be probed. */
export async function markRead(id: string, userId: string): Promise<NotificationRecord> {
  const existing = await prisma.notification.findFirst({
    where: { id, userId },
    select: { id: true, isRead: true },
  });

  if (!existing) throw new NotFoundError('Notification');
  if (existing.isRead) {
    return prisma.notification.findUniqueOrThrow({ where: { id }, select: notificationSelect });
  }

  return prisma.notification.update({
    where: { id },
    data: { isRead: true, readAt: new Date() },
    select: notificationSelect,
  });
}

export async function markAllRead(userId: string): Promise<{ updated: number }> {
  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });

  return { updated: result.count };
}

export interface NotificationPreference {
  type: NotificationType;
  inAppEnabled: boolean;
  emailEnabled: boolean;
}

/** Returns a row for every type, filling unset ones with the enabled default. */
export async function getPreferences(userId: string): Promise<NotificationPreference[]> {
  const stored = await prisma.notificationSetting.findMany({
    where: { userId },
    select: { type: true, inAppEnabled: true, emailEnabled: true },
  });

  const byType = new Map(stored.map((row) => [row.type, row]));

  return NOTIFICATION_TYPES.map((type) => {
    const row = byType.get(type);
    return {
      type,
      inAppEnabled: row?.inAppEnabled ?? true,
      emailEnabled: row?.emailEnabled ?? true,
    };
  });
}

export async function savePreferences(
  userId: string,
  preferences: readonly NotificationPreference[],
): Promise<NotificationPreference[]> {
  await prisma.$transaction(
    preferences.map((preference) =>
      prisma.notificationSetting.upsert({
        where: { userId_type: { userId, type: preference.type } },
        create: {
          userId,
          type: preference.type,
          inAppEnabled: preference.inAppEnabled,
          emailEnabled: preference.emailEnabled,
        },
        update: {
          inAppEnabled: preference.inAppEnabled,
          emailEnabled: preference.emailEnabled,
        },
      }),
    ),
  );

  return getPreferences(userId);
}
