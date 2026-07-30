import type { ListQueryParams } from './api';
import type { UserRole } from './enums';

export type NotificationType =
  | 'FEE_DUE'
  | 'EXAM_REMINDER'
  | 'ASSIGNMENT_DUE'
  | 'LEAVE_APPROVED'
  | 'LEAVE_REJECTED'
  | 'NEW_NOTICE'
  | 'LIBRARY_DUE'
  | 'NEW_MESSAGE'
  | 'RESULT_PUBLISHED'
  | 'ATTENDANCE_ALERT'
  | 'GENERAL';

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  FEE_DUE: 'Fee due',
  EXAM_REMINDER: 'Exam reminder',
  ASSIGNMENT_DUE: 'Assignment due',
  LEAVE_APPROVED: 'Leave approved',
  LEAVE_REJECTED: 'Leave rejected',
  NEW_NOTICE: 'New notice',
  LIBRARY_DUE: 'Library due date',
  NEW_MESSAGE: 'New message',
  RESULT_PUBLISHED: 'Results published',
  ATTENDANCE_ALERT: 'Attendance alert',
  GENERAL: 'General',
};

interface UserBrief {
  id: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  avatarId: string | null;
}

export interface MessageAttachment {
  id: string;
  fileId: string;
  file: { id: string; originalName: string; mimeType: string; sizeBytes: number };
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  sentAt: string;
  sender: UserBrief;
  attachments: MessageAttachment[];
}

export interface ConversationSummary {
  id: string;
  subject: string | null;
  isGroup: boolean;
  lastMessageAt: string;
  unreadCount: number;
  isArchived: boolean;
  isMuted: boolean;
  participants: UserBrief[];
  lastMessage: { id: string; body: string; sentAt: string; senderId: string } | null;
}

export interface ConversationParticipant {
  id: string;
  userId: string;
  lastReadAt: string | null;
  isArchived: boolean;
  isMuted: boolean;
  user: { id: string; firstName: string; lastName: string; email: string; role: UserRole; avatarId: string | null };
}

export interface Conversation {
  id: string;
  subject: string | null;
  isGroup: boolean;
  lastMessageAt: string;
  createdBy: { id: string; firstName: string; lastName: string } | null;
  participants: ConversationParticipant[];
}

export interface RecipientOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  identifier: string | null;
}

export interface UploadedAttachment {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPreference {
  type: NotificationType;
  inAppEnabled: boolean;
  emailEnabled: boolean;
}

export interface UnreadCounts {
  messages: number;
  notifications: number;
}

// -------------------------------------------------------------------- Payloads

export interface StartConversationPayload {
  participantIds: string[];
  subject?: string;
  body: string;
  attachmentIds: string[];
}

export interface SendMessagePayload {
  body: string;
  attachmentIds: string[];
}

export interface ConversationQuery extends ListQueryParams {
  includeArchived?: boolean;
  onlyUnread?: boolean;
}

export interface NotificationQuery extends ListQueryParams {
  onlyUnread?: boolean;
  type?: NotificationType;
}
