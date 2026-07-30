import { api } from '@/lib/api-client';
import type { PaginatedData } from '@/types/api';
import type {
  AnnouncementPayload,
  CreateNoticePayload,
  Notice,
  NoticeQuery,
  NoticeStats,
  PublishNoticePayload,
  UpdateNoticePayload,
} from '@/types/notice';

const BASE = '/notices';

export const noticeService = {
  getStats: () => api.get<NoticeStats>(`${BASE}/stats`),

  list: (params: NoticeQuery) => api.get<PaginatedData<Notice>>(BASE, { params }),
  get: (id: string) => api.get<Notice>(`${BASE}/${id}`),
  create: (payload: CreateNoticePayload) => api.post<Notice>(BASE, payload),
  update: (id: string, payload: UpdateNoticePayload) =>
    api.patch<Notice>(`${BASE}/${id}`, payload),
  remove: (id: string) => api.delete<null>(`${BASE}/${id}`),

  publish: (id: string, payload: PublishNoticePayload) =>
    api.post<Notice>(`${BASE}/${id}/publish`, payload),
  setPinned: (id: string, isPinned: boolean) =>
    api.post<Notice>(`${BASE}/${id}/pin`, { isPinned }),
  markRead: (id: string) => api.post<{ isRead: true }>(`${BASE}/${id}/read`),

  runSchedule: () => api.post<{ published: number; expired: number }>(`${BASE}/run-schedule`),

  sendAnnouncement: (payload: AnnouncementPayload) =>
    api.post<{ delivered: number; emailed: number }>(`${BASE}/announcements`, payload),

  uploadAttachments: (id: string, files: File[]) => {
    const formData = new FormData();
    for (const file of files) formData.append('attachments', file);
    return api.upload<Notice>(`${BASE}/${id}/attachments`, formData);
  },

  removeAttachment: (id: string, fileId: string) =>
    api.delete<null>(`${BASE}/${id}/attachments/${fileId}`),
};
