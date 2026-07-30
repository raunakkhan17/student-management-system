import type { ListQueryParams } from './api';
import type { UserRole } from './enums';
import type { Priority } from './hostel';

export type NoticeCategory =
  | 'ACADEMIC'
  | 'HOLIDAY'
  | 'EVENTS'
  | 'EMERGENCY'
  | 'EXAMINATION'
  | 'GENERAL';

export type NoticeStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'EXPIRED' | 'ARCHIVED';

export const NOTICE_CATEGORY_LABELS: Record<NoticeCategory, string> = {
  ACADEMIC: 'Academic',
  HOLIDAY: 'Holiday',
  EVENTS: 'Events',
  EMERGENCY: 'Emergency',
  EXAMINATION: 'Examination',
  GENERAL: 'General',
};

export const NOTICE_STATUS_LABELS: Record<NoticeStatus, string> = {
  DRAFT: 'Draft',
  SCHEDULED: 'Scheduled',
  PUBLISHED: 'Published',
  EXPIRED: 'Expired',
  ARCHIVED: 'Archived',
};

export interface NoticeAudience {
  id: string;
  role: UserRole | null;
  classId: string | null;
  sectionId: string | null;
  class: { id: string; name: string } | null;
  section: { id: string; name: string } | null;
}

export interface NoticeAttachment {
  id: string;
  fileId: string;
  file: { id: string; originalName: string; mimeType: string; sizeBytes: number };
}

export interface Notice {
  id: string;
  title: string;
  content: string;
  category: NoticeCategory;
  priority: Priority;
  status: NoticeStatus;
  isPinned: boolean;
  publishAt: string | null;
  expiresAt: string | null;
  viewCount: number;
  createdAt: string;
  createdBy: { id: string; firstName: string; lastName: string } | null;
  audiences: NoticeAudience[];
  attachments: NoticeAttachment[];
  _count: { reads: number };
  /** Whether the signed-in user has opened this notice. */
  isRead: boolean;
}

export interface NoticeStats {
  total: number;
  unread: number;
  pinned: number;
  scheduled: number;
}

// -------------------------------------------------------------------- Payloads

export interface AudienceRulePayload {
  role?: UserRole | null;
  classId?: string | null;
  sectionId?: string | null;
}

export interface CreateNoticePayload {
  title: string;
  content: string;
  category: NoticeCategory;
  priority: Priority;
  isPinned: boolean;
  publishAt?: string | null;
  expiresAt?: string | null;
  audiences: AudienceRulePayload[];
  attachmentIds: string[];
  publishNow: boolean;
}

export interface UpdateNoticePayload {
  title?: string;
  content?: string;
  category?: NoticeCategory;
  priority?: Priority;
  isPinned?: boolean;
  publishAt?: string | null;
  expiresAt?: string | null;
  audiences?: AudienceRulePayload[];
}

export interface PublishNoticePayload {
  publishAt?: string | null;
  expiresAt?: string | null;
  silent: boolean;
}

export interface AnnouncementPayload {
  title: string;
  body: string;
  roles: UserRole[];
  link?: string;
}

export interface NoticeQuery extends ListQueryParams {
  category?: NoticeCategory;
  status?: string;
  priority?: Priority;
  onlyUnread?: boolean;
  onlyPinned?: boolean;
}
