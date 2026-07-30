import { Prisma, type UserRole } from '@prisma/client';
import { prisma } from '@/config/prisma';
import { env } from '@/config/env';
import type { ListQueryOptions, PaginatedData } from '@/types/api';
import type { AuthenticatedUser } from '@/types/auth';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/utils/api-error';
import { buildPaginationMeta } from '@/utils/pagination';
import { notify } from './notification.service';
import type { SendMessageInput, StartConversationInput } from '@/validators/message.validator';

const participantSelect = {
  id: true,
  userId: true,
  lastReadAt: true,
  isArchived: true,
  isMuted: true,
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      avatarId: true,
    },
  },
} satisfies Prisma.ConversationParticipantSelect;

const conversationInclude = {
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  participants: { select: participantSelect },
} satisfies Prisma.ConversationInclude;

export type ConversationRecord = Prisma.ConversationGetPayload<{
  include: typeof conversationInclude;
}>;

const messageInclude = {
  sender: {
    select: { id: true, firstName: true, lastName: true, role: true, avatarId: true },
  },
  attachments: {
    select: {
      id: true,
      fileId: true,
      file: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } },
    },
  },
} satisfies Prisma.MessageInclude;

export type MessageRecord = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

/** Throws unless the caller is in the conversation. */
async function requireParticipant(
  conversationId: string,
  userId: string,
): Promise<{ id: string; lastReadAt: Date | null }> {
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { id: true, lastReadAt: true },
  });

  if (!participant) {
    // Deliberately a 404: a non-participant should not learn the thread exists.
    throw new NotFoundError('Conversation');
  }

  return participant;
}

/**
 * Starts a thread and posts its first message.
 *
 * A one-to-one thread is reused when it already exists, so replying to the same
 * person does not scatter history across duplicate conversations.
 */
export async function startConversation(
  input: StartConversationInput,
  user: AuthenticatedUser,
): Promise<ConversationRecord> {
  const participantIds = [...new Set(input.participantIds.filter((id) => id !== user.id))];

  if (participantIds.length === 0) {
    throw new BadRequestError('Choose someone to send this to', [
      { field: 'participantIds', message: 'You cannot message only yourself' },
    ]);
  }

  const recipients = await prisma.user.findMany({
    where: { id: { in: participantIds }, deletedAt: null, status: 'ACTIVE' },
    select: { id: true },
  });

  if (recipients.length !== participantIds.length) {
    throw new BadRequestError('One or more recipients are unavailable', [
      { field: 'participantIds', message: 'Remove the inactive recipients and try again' },
    ]);
  }

  const isGroup = participantIds.length > 1;

  const existingId = isGroup ? null : await findDirectConversation(user.id, participantIds[0] as string);

  const conversationId = await prisma.$transaction(async (tx) => {
    let id = existingId;

    if (!id) {
      const created = await tx.conversation.create({
        data: {
          subject: input.subject ?? null,
          isGroup,
          createdById: user.id,
          participants: {
            create: [
              { userId: user.id, lastReadAt: new Date() },
              ...participantIds.map((userId) => ({ userId })),
            ],
          },
        },
        select: { id: true },
      });
      id = created.id;
    }

    await createMessage(tx, id, user.id, input.body, input.attachmentIds);
    return id;
  });

  await notifyRecipients(conversationId, user, input.body);

  return prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: conversationInclude,
  });
}

/** Finds an existing two-person thread between these users, if any. */
async function findDirectConversation(userId: string, otherId: string): Promise<string | null> {
  const existing = await prisma.conversation.findFirst({
    where: {
      deletedAt: null,
      isGroup: false,
      AND: [
        { participants: { some: { userId } } },
        { participants: { some: { userId: otherId } } },
      ],
    },
    select: { id: true, participants: { select: { userId: true } } },
  });

  // `some` twice can still match a group thread, so confirm the size.
  return existing && existing.participants.length === 2 ? existing.id : null;
}

/** Inserts a message plus its attachments and delivery receipts. */
async function createMessage(
  tx: Prisma.TransactionClient,
  conversationId: string,
  senderId: string,
  body: string,
  attachmentIds: readonly string[],
): Promise<string> {
  const message = await tx.message.create({
    data: {
      conversationId,
      senderId,
      body,
      ...(attachmentIds.length > 0
        ? { attachments: { create: attachmentIds.map((fileId) => ({ fileId })) } }
        : {}),
    },
    select: { id: true },
  });

  const others = await tx.conversationParticipant.findMany({
    where: { conversationId, userId: { not: senderId } },
    select: { userId: true },
  });

  if (others.length > 0) {
    await tx.messageReceipt.createMany({
      data: others.map((participant) => ({
        messageId: message.id,
        userId: participant.userId,
        status: 'SENT',
      })),
      skipDuplicates: true,
    });
  }

  // Drives inbox ordering, so it must move with every message.
  await tx.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date() },
  });

  // Posting into an archived thread brings it back into the recipient's inbox.
  await tx.conversationParticipant.updateMany({
    where: { conversationId, userId: { not: senderId }, isArchived: true },
    data: { isArchived: false },
  });

  return message.id;
}

/** Notifies everyone in the thread except the sender, skipping muted members. */
async function notifyRecipients(
  conversationId: string,
  sender: AuthenticatedUser,
  body: string,
): Promise<void> {
  const participants = await prisma.conversationParticipant.findMany({
    where: { conversationId, userId: { not: sender.id }, isMuted: false },
    select: { userId: true },
  });

  if (participants.length === 0) return;

  const preview = body.length > 160 ? `${body.slice(0, 160)}…` : body;
  const senderName = `${sender.firstName} ${sender.lastName}`;

  await notify({
    userIds: participants.map((participant) => participant.userId),
    type: 'NEW_MESSAGE',
    title: `New message from ${senderName}`,
    body: preview,
    link: `/messages?conversation=${conversationId}`,
    entityType: 'Conversation',
    entityId: conversationId,
    emailTemplateKey: 'new-message',
    emailVariables: {
      senderName,
      title: `New message from ${senderName}`,
      body: preview,
      conversationUrl: `${env.FRONTEND_URL}/messages?conversation=${conversationId}`,
    },
  });
}

export async function sendMessage(
  conversationId: string,
  input: SendMessageInput,
  user: AuthenticatedUser,
): Promise<MessageRecord> {
  await requireParticipant(conversationId, user.id);

  const messageId = await prisma.$transaction(async (tx) => {
    const id = await createMessage(tx, conversationId, user.id, input.body, input.attachmentIds);

    // The sender has, by definition, read their own message.
    await tx.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId: user.id } },
      data: { lastReadAt: new Date(), isArchived: false },
    });

    return id;
  });

  await notifyRecipients(conversationId, user, input.body);

  return prisma.message.findUniqueOrThrow({ where: { id: messageId }, include: messageInclude });
}

export interface ConversationSummary {
  id: string;
  subject: string | null;
  isGroup: boolean;
  lastMessageAt: Date;
  unreadCount: number;
  isArchived: boolean;
  isMuted: boolean;
  participants: {
    id: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    avatarId: string | null;
  }[];
  lastMessage: { id: string; body: string; sentAt: Date; senderId: string } | null;
}

/**
 * The caller's inbox.
 *
 * Unread counts come from `lastReadAt` rather than message receipts, so a thread
 * has exactly one source of truth for "new since I last looked".
 */
export async function listConversations(
  user: AuthenticatedUser,
  query: ListQueryOptions,
  filters: { includeArchived?: boolean; onlyUnread?: boolean },
): Promise<PaginatedData<ConversationSummary>> {
  const where: Prisma.ConversationWhereInput = {
    deletedAt: null,
    participants: {
      some: {
        userId: user.id,
        ...(filters.includeArchived ? {} : { isArchived: false }),
      },
    },
    ...(query.search
      ? {
          OR: [
            { subject: { contains: query.search, mode: 'insensitive' } },
            { messages: { some: { body: { contains: query.search, mode: 'insensitive' } } } },
            {
              participants: {
                some: {
                  userId: { not: user.id },
                  user: {
                    OR: [
                      { firstName: { contains: query.search, mode: 'insensitive' } },
                      { lastName: { contains: query.search, mode: 'insensitive' } },
                    ],
                  },
                },
              },
            },
          ],
        }
      : {}),
  };

  const [rows, totalItems] = await Promise.all([
    prisma.conversation.findMany({
      where,
      include: {
        ...conversationInclude,
        messages: {
          where: { deletedAt: null },
          orderBy: { sentAt: 'desc' },
          take: 1,
          select: { id: true, body: true, sentAt: true, senderId: true },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
      skip: query.skip,
      take: query.take,
    }),
    prisma.conversation.count({ where }),
  ]);

  const summaries = await Promise.all(
    rows.map(async (row) => {
      const me = row.participants.find((participant) => participant.userId === user.id);

      const unreadCount = await prisma.message.count({
        where: {
          conversationId: row.id,
          deletedAt: null,
          senderId: { not: user.id },
          ...(me?.lastReadAt ? { sentAt: { gt: me.lastReadAt } } : {}),
        },
      });

      return {
        id: row.id,
        subject: row.subject,
        isGroup: row.isGroup,
        lastMessageAt: row.lastMessageAt,
        unreadCount,
        isArchived: me?.isArchived ?? false,
        isMuted: me?.isMuted ?? false,
        participants: row.participants
          .filter((participant) => participant.userId !== user.id)
          .map((participant) => ({
            id: participant.user.id,
            firstName: participant.user.firstName,
            lastName: participant.user.lastName,
            role: participant.user.role,
            avatarId: participant.user.avatarId,
          })),
        lastMessage: row.messages[0] ?? null,
      };
    }),
  );

  const filtered = filters.onlyUnread
    ? summaries.filter((summary) => summary.unreadCount > 0)
    : summaries;

  return { items: filtered, pagination: buildPaginationMeta(totalItems, query) };
}

export async function getConversation(
  conversationId: string,
  user: AuthenticatedUser,
): Promise<ConversationRecord> {
  await requireParticipant(conversationId, user.id);

  return prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: conversationInclude,
  });
}

export async function listMessages(
  conversationId: string,
  user: AuthenticatedUser,
  query: ListQueryOptions,
  before?: Date,
): Promise<PaginatedData<MessageRecord>> {
  await requireParticipant(conversationId, user.id);

  const where: Prisma.MessageWhereInput = {
    conversationId,
    deletedAt: null,
    ...(before ? { sentAt: { lt: before } } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.message.findMany({
      where,
      include: messageInclude,
      orderBy: { sentAt: 'desc' },
      skip: query.skip,
      take: query.take,
    }),
    prisma.message.count({ where }),
  ]);

  // Returned oldest-first so the thread reads naturally top to bottom.
  return { items: items.reverse(), pagination: buildPaginationMeta(totalItems, query) };
}

/** Marks the thread read up to now and flips the caller's receipts to READ. */
export async function markConversationRead(
  conversationId: string,
  userId: string,
): Promise<{ readAt: Date }> {
  await requireParticipant(conversationId, userId);

  const readAt = new Date();

  await prisma.$transaction([
    prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: readAt },
    }),
    prisma.messageReceipt.updateMany({
      where: { userId, status: { not: 'READ' }, message: { conversationId } },
      data: { status: 'READ', readAt },
    }),
  ]);

  return { readAt };
}

export async function updateParticipation(
  conversationId: string,
  userId: string,
  input: { isArchived?: boolean; isMuted?: boolean },
): Promise<{ isArchived: boolean; isMuted: boolean }> {
  await requireParticipant(conversationId, userId);

  const updated = await prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: {
      ...(input.isArchived !== undefined ? { isArchived: input.isArchived } : {}),
      ...(input.isMuted !== undefined ? { isMuted: input.isMuted } : {}),
    },
    select: { isArchived: true, isMuted: true },
  });

  return updated;
}

/** Total unread messages across every thread, for the inbox badge. */
export async function countUnreadMessages(userId: string): Promise<number> {
  const participations = await prisma.conversationParticipant.findMany({
    where: { userId, isArchived: false },
    select: { conversationId: true, lastReadAt: true },
  });

  if (participations.length === 0) return 0;

  const counts = await Promise.all(
    participations.map((participation) =>
      prisma.message.count({
        where: {
          conversationId: participation.conversationId,
          deletedAt: null,
          senderId: { not: userId },
          ...(participation.lastReadAt ? { sentAt: { gt: participation.lastReadAt } } : {}),
        },
      }),
    ),
  );

  return counts.reduce((sum, count) => sum + count, 0);
}

export interface RecipientOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  identifier: string | null;
}

/**
 * People the caller may message.
 *
 * Students and parents may only contact staff — peer-to-peer student messaging
 * is not in the PRD and would need moderation the product does not have.
 */
export async function listRecipients(
  user: AuthenticatedUser,
  filters: { search?: string; role?: UserRole },
  limit = 20,
): Promise<RecipientOption[]> {
  const isStaff = !['STUDENT', 'PARENT'].includes(user.role);

  const staffRoles: UserRole[] = [
    'SUPER_ADMIN',
    'ADMIN',
    'TEACHER',
    'ACCOUNTANT',
    'LIBRARIAN',
  ];

  const allowedRoles = isStaff
    ? ([...staffRoles, 'STUDENT', 'PARENT'] as UserRole[])
    : staffRoles;

  const roleFilter = filters.role
    ? allowedRoles.includes(filters.role)
      ? [filters.role]
      : []
    : allowedRoles;

  if (roleFilter.length === 0) return [];

  const term = filters.search?.trim();

  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      id: { not: user.id },
      role: { in: roleFilter },
      ...(term
        ? {
            OR: [
              { firstName: { contains: term, mode: 'insensitive' } },
              { lastName: { contains: term, mode: 'insensitive' } },
              { email: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      studentProfile: { select: { admissionNumber: true } },
      teacherProfile: { select: { employeeId: true } },
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    take: limit,
  });

  return users.map((row) => ({
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    role: row.role,
    identifier: row.studentProfile?.admissionNumber ?? row.teacherProfile?.employeeId ?? null,
  }));
}

/** Removes a message the caller sent. Others' messages are never touched. */
export async function deleteMessage(id: string, user: AuthenticatedUser): Promise<void> {
  const message = await prisma.message.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, senderId: true },
  });

  if (!message) throw new NotFoundError('Message');

  if (message.senderId !== user.id) {
    throw new ForbiddenError('You can only delete your own messages');
  }

  await prisma.message.update({ where: { id }, data: { deletedAt: new Date() } });
}
