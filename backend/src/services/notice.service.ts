import {
  Prisma,
  type NoticeCategory,
  type NoticeStatus,
  type Priority,
  type UserRole,
} from '@prisma/client';
import { prisma } from '@/config/prisma';
import { env } from '@/config/env';
import type { ListQueryOptions, PaginatedData } from '@/types/api';
import type { AuthenticatedUser } from '@/types/auth';
import { ConflictError, NotFoundError } from '@/utils/api-error';
import { buildPaginationMeta } from '@/utils/pagination';
import { notify } from './notification.service';
import type { AnnouncementInput, CreateNoticeInput, PublishNoticeInput } from '@/validators/notice.validator';

const noticeInclude = {
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  audiences: {
    select: {
      id: true,
      role: true,
      classId: true,
      sectionId: true,
      class: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } },
    },
  },
  attachments: {
    select: {
      id: true,
      fileId: true,
      file: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } },
    },
  },
  _count: { select: { reads: true } },
} satisfies Prisma.NoticeInclude;

export type NoticeRecord = Prisma.NoticeGetPayload<{ include: typeof noticeInclude }>;

interface AudienceRule {
  role?: UserRole | null;
  classId?: string | null;
  sectionId?: string | null;
}

/**
 * Removes duplicate audience rules before they hit the database.
 *
 * `NoticeAudience` has a composite unique across three nullable columns, and
 * Postgres treats NULLs as distinct in a unique index — so two identical
 * role-only rules would both insert. This is the guard for that.
 */
function dedupeAudiences(rules: readonly AudienceRule[]): AudienceRule[] {
  const seen = new Set<string>();
  const unique: AudienceRule[] = [];

  for (const rule of rules) {
    const key = `${rule.role ?? ''}|${rule.classId ?? ''}|${rule.sectionId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(rule);
  }

  return unique;
}

/**
 * The visibility filter for a reader.
 *
 * A notice reaches someone when it has no audience rules at all, or when any
 * rule matches their role, class or section. Staff who can manage notices see
 * everything, including drafts.
 */
function visibilityFilter(user: AuthenticatedUser, context: {
  classId: string | null;
  sectionId: string | null;
}): Prisma.NoticeWhereInput {
  const now = new Date();

  return {
    deletedAt: null,
    status: 'PUBLISHED',
    publishAt: { lte: now },
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    AND: [
      {
        OR: [
          // Untargeted notices are for everyone.
          { audiences: { none: {} } },
          {
            audiences: {
              some: {
                OR: [
                  { role: user.role },
                  ...(context.classId ? [{ classId: context.classId }] : []),
                  ...(context.sectionId ? [{ sectionId: context.sectionId }] : []),
                ],
              },
            },
          },
        ],
      },
    ],
  };
}

/** A student's class and section, used to resolve targeted notices. */
async function readerContext(
  user: AuthenticatedUser,
): Promise<{ classId: string | null; sectionId: string | null }> {
  if (user.studentId) {
    const student = await prisma.student.findUnique({
      where: { id: user.studentId },
      select: { classId: true, sectionId: true },
    });
    return { classId: student?.classId ?? null, sectionId: student?.sectionId ?? null };
  }

  // A parent inherits the classes of the children they are linked to.
  if (user.guardianId) {
    const links = await prisma.studentGuardian.findMany({
      where: { guardianId: user.guardianId },
      select: { student: { select: { classId: true, sectionId: true } } },
    });

    const first = links.find((link) => link.student.classId);
    return {
      classId: first?.student.classId ?? null,
      sectionId: first?.student.sectionId ?? null,
    };
  }

  return { classId: null, sectionId: null };
}

export interface NoticeFilters {
  category?: NoticeCategory;
  status?: NoticeStatus[];
  priority?: Priority;
  onlyUnread?: boolean;
  onlyPinned?: boolean;
}

export async function listNotices(
  user: AuthenticatedUser,
  query: ListQueryOptions,
  filters: NoticeFilters,
  canManage: boolean,
): Promise<PaginatedData<NoticeRecord & { isRead: boolean }>> {
  const scope = canManage
    ? { deletedAt: null, ...(filters.status?.length ? { status: { in: filters.status } } : {}) }
    : await readerContext(user).then((context) => visibilityFilter(user, context));

  const where: Prisma.NoticeWhereInput = {
    ...scope,
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.onlyPinned ? { isPinned: true } : {}),
    ...(filters.onlyUnread ? { reads: { none: { userId: user.id } } } : {}),
    ...(query.search
      ? {
          OR: [
            { title: { contains: query.search, mode: 'insensitive' } },
            { content: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.notice.findMany({
      where,
      include: {
        ...noticeInclude,
        // One row at most: whether *this* reader has opened it.
        reads: { where: { userId: user.id }, select: { readAt: true } },
      },
      // Pinned first, then newest.
      orderBy: [{ isPinned: 'desc' }, { publishAt: 'desc' }, { createdAt: 'desc' }],
      skip: query.skip,
      take: query.take,
    }),
    prisma.notice.count({ where }),
  ]);

  return {
    items: items.map(({ reads, ...notice }) => ({ ...notice, isRead: reads.length > 0 })),
    pagination: buildPaginationMeta(totalItems, query),
  };
}

export async function getNotice(
  id: string,
  user: AuthenticatedUser,
  canManage: boolean,
): Promise<NoticeRecord & { isRead: boolean }> {
  const scope = canManage
    ? { deletedAt: null }
    : await readerContext(user).then((context) => visibilityFilter(user, context));

  const notice = await prisma.notice.findFirst({
    where: { id, ...scope },
    include: {
      ...noticeInclude,
      reads: { where: { userId: user.id }, select: { readAt: true } },
    },
  });

  if (!notice) throw new NotFoundError('Notice');

  const { reads, ...rest } = notice;
  return { ...rest, isRead: reads.length > 0 };
}

export async function createNotice(
  input: CreateNoticeInput,
  createdById: string,
): Promise<NoticeRecord> {
  const audiences = dedupeAudiences(input.audiences);
  const publishAt = input.publishNow ? new Date() : (input.publishAt ?? null);

  const status: NoticeStatus = input.publishNow
    ? 'PUBLISHED'
    : publishAt
      ? 'SCHEDULED'
      : 'DRAFT';

  const notice = await prisma.$transaction(async (tx) => {
    const created = await tx.notice.create({
      data: {
        title: input.title,
        content: input.content,
        category: input.category,
        priority: input.priority,
        isPinned: input.isPinned,
        status,
        publishAt,
        expiresAt: input.expiresAt ?? null,
        createdById,
        ...(audiences.length > 0
          ? {
              audiences: {
                create: audiences.map((rule) => ({
                  role: rule.role ?? null,
                  classId: rule.classId ?? null,
                  sectionId: rule.sectionId ?? null,
                })),
              },
            }
          : {}),
        ...(input.attachmentIds.length > 0
          ? { attachments: { create: input.attachmentIds.map((fileId) => ({ fileId })) } }
          : {}),
      },
    });

    return tx.notice.findUniqueOrThrow({ where: { id: created.id }, include: noticeInclude });
  });

  if (status === 'PUBLISHED') {
    await announceNotice(notice);
  }

  return notice;
}

export async function updateNotice(
  id: string,
  input: {
    title?: string;
    content?: string;
    category?: NoticeCategory;
    priority?: Priority;
    isPinned?: boolean;
    publishAt?: Date | null;
    expiresAt?: Date | null;
    audiences?: AudienceRule[];
  },
): Promise<NoticeRecord> {
  const existing = await prisma.notice.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });

  if (!existing) throw new NotFoundError('Notice');

  return prisma.$transaction(async (tx) => {
    if (input.audiences) {
      // Audience rules are replaced as a set, so a removed class stops matching.
      await tx.noticeAudience.deleteMany({ where: { noticeId: id } });

      const audiences = dedupeAudiences(input.audiences);
      if (audiences.length > 0) {
        await tx.noticeAudience.createMany({
          data: audiences.map((rule) => ({
            noticeId: id,
            role: rule.role ?? null,
            classId: rule.classId ?? null,
            sectionId: rule.sectionId ?? null,
          })),
        });
      }
    }

    await tx.notice.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.isPinned !== undefined ? { isPinned: input.isPinned } : {}),
        ...(input.publishAt !== undefined ? { publishAt: input.publishAt } : {}),
        ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
      },
    });

    return tx.notice.findUniqueOrThrow({ where: { id }, include: noticeInclude });
  });
}

/**
 * Publishes a notice and tells its audience.
 *
 * Publishing twice is refused rather than silently re-notifying everybody.
 */
export async function publishNotice(
  id: string,
  input: PublishNoticeInput,
): Promise<NoticeRecord> {
  const existing = await prisma.notice.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, status: true },
  });

  if (!existing) throw new NotFoundError('Notice');

  if (existing.status === 'PUBLISHED') {
    throw new ConflictError('This notice is already published');
  }

  const publishAt = input.publishAt ?? new Date();
  const isScheduled = publishAt.getTime() > Date.now();

  const notice = await prisma.notice.update({
    where: { id },
    data: {
      status: isScheduled ? 'SCHEDULED' : 'PUBLISHED',
      publishAt,
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
    },
    include: noticeInclude,
  });

  if (!isScheduled && !input.silent) {
    await announceNotice(notice);
  }

  return notice;
}

export async function setPinned(id: string, isPinned: boolean): Promise<NoticeRecord> {
  const existing = await prisma.notice.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });

  if (!existing) throw new NotFoundError('Notice');

  return prisma.notice.update({ where: { id }, data: { isPinned }, include: noticeInclude });
}

export async function deleteNotice(id: string): Promise<void> {
  const existing = await prisma.notice.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });

  if (!existing) throw new NotFoundError('Notice');

  await prisma.notice.update({ where: { id }, data: { deletedAt: new Date() } });
}

/** Records that a reader opened a notice, and bumps the view counter once. */
export async function markNoticeRead(id: string, userId: string): Promise<{ isRead: true }> {
  const notice = await prisma.notice.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });

  if (!notice) throw new NotFoundError('Notice');

  const existing = await prisma.noticeRead.findUnique({
    where: { noticeId_userId: { noticeId: id, userId } },
    select: { id: true },
  });

  if (existing) return { isRead: true };

  await prisma.$transaction([
    prisma.noticeRead.create({ data: { noticeId: id, userId } }),
    prisma.notice.update({ where: { id }, data: { viewCount: { increment: 1 } } }),
  ]);

  return { isRead: true };
}

export async function addAttachments(
  noticeId: string,
  fileIds: readonly string[],
): Promise<NoticeRecord> {
  const notice = await prisma.notice.findFirst({
    where: { id: noticeId, deletedAt: null },
    select: { id: true },
  });

  if (!notice) throw new NotFoundError('Notice');

  await prisma.noticeAttachment.createMany({
    data: fileIds.map((fileId) => ({ noticeId, fileId })),
    skipDuplicates: true,
  });

  return prisma.notice.findUniqueOrThrow({ where: { id: noticeId }, include: noticeInclude });
}

export async function removeAttachment(noticeId: string, fileId: string): Promise<void> {
  const attachment = await prisma.noticeAttachment.findUnique({
    where: { noticeId_fileId: { noticeId, fileId } },
    select: { id: true },
  });

  if (!attachment) throw new NotFoundError('Attachment');

  await prisma.noticeAttachment.delete({ where: { id: attachment.id } });
}

/**
 * Resolves the user ids a notice targets.
 *
 * Untargeted notices reach every active user. Otherwise each rule contributes
 * its matches, and the union is notified once per person.
 */
async function resolveAudienceUserIds(notice: NoticeRecord): Promise<string[]> {
  if (notice.audiences.length === 0) {
    const users = await prisma.user.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      select: { id: true },
    });
    return users.map((user) => user.id);
  }

  const roles = notice.audiences.flatMap((rule) => (rule.role ? [rule.role] : []));
  const classIds = notice.audiences.flatMap((rule) => (rule.classId ? [rule.classId] : []));
  const sectionIds = notice.audiences.flatMap((rule) => (rule.sectionId ? [rule.sectionId] : []));

  const conditions: Prisma.UserWhereInput[] = [];

  if (roles.length > 0) conditions.push({ role: { in: roles } });

  if (classIds.length > 0 || sectionIds.length > 0) {
    conditions.push({
      studentProfile: {
        deletedAt: null,
        OR: [
          ...(classIds.length > 0 ? [{ classId: { in: classIds } }] : []),
          ...(sectionIds.length > 0 ? [{ sectionId: { in: sectionIds } }] : []),
        ],
      },
    });
  }

  if (conditions.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { deletedAt: null, status: 'ACTIVE', OR: conditions },
    select: { id: true },
  });

  return users.map((user) => user.id);
}

/** Notifies a published notice's audience in a single fan-out. */
async function announceNotice(notice: NoticeRecord): Promise<void> {
  const userIds = await resolveAudienceUserIds(notice);
  if (userIds.length === 0) return;

  // Emergency notices always email; the rest respect each user's preference only.
  const preview = notice.content.length > 240 ? `${notice.content.slice(0, 240)}…` : notice.content;

  await notify({
    userIds,
    type: 'NEW_NOTICE',
    title: notice.title,
    body: preview,
    link: `/notices?highlight=${notice.id}`,
    entityType: 'Notice',
    entityId: notice.id,
    emailTemplateKey: 'new-notice',
    emailVariables: {
      title: notice.title,
      body: preview,
      category: notice.category,
      noticeUrl: `${env.FRONTEND_URL}/notices?highlight=${notice.id}`,
    },
  });
}

/**
 * Publishes any notice whose scheduled time has passed, and expires any whose
 * expiry has. Idempotent, so it can be re-run safely.
 */
export async function runNoticeSchedule(): Promise<{ published: number; expired: number }> {
  const now = new Date();

  const due = await prisma.notice.findMany({
    where: { deletedAt: null, status: 'SCHEDULED', publishAt: { lte: now } },
    include: noticeInclude,
  });

  for (const notice of due) {
    await prisma.notice.update({ where: { id: notice.id }, data: { status: 'PUBLISHED' } });
    await announceNotice(notice);
  }

  const expired = await prisma.notice.updateMany({
    where: { deletedAt: null, status: 'PUBLISHED', expiresAt: { lt: now } },
    data: { status: 'EXPIRED' },
  });

  return { published: due.length, expired: expired.count };
}

/**
 * Sends a one-off announcement straight to the notification centre.
 *
 * PRD Module 16 calls this the announcement centre: unlike a notice it is not
 * archived on the board, it is purely a push.
 */
export async function sendAnnouncement(
  input: AnnouncementInput,
): Promise<{ delivered: number; emailed: number }> {
  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      ...(input.roles.length > 0 ? { role: { in: input.roles } } : {}),
    },
    select: { id: true },
  });

  return notify({
    userIds: users.map((user) => user.id),
    type: 'GENERAL',
    title: input.title,
    body: input.body,
    link: input.link ?? null,
  });
}

/** Counters for the notice board header. */
export async function getNoticeStats(user: AuthenticatedUser, canManage: boolean) {
  const context = await readerContext(user);
  const visible = canManage ? { deletedAt: null } : visibilityFilter(user, context);

  const [total, unread, pinned, scheduled] = await Promise.all([
    prisma.notice.count({ where: visible }),
    prisma.notice.count({ where: { ...visible, reads: { none: { userId: user.id } } } }),
    prisma.notice.count({ where: { ...visible, isPinned: true } }),
    canManage
      ? prisma.notice.count({ where: { deletedAt: null, status: 'SCHEDULED' } })
      : Promise.resolve(0),
  ]);

  return { total, unread, pinned, scheduled };
}
