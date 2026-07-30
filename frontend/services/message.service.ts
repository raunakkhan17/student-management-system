import { api } from '@/lib/api-client';
import type { PaginatedData } from '@/types/api';
import type { UserRole } from '@/types/enums';
import type {
  AppNotification,
  Conversation,
  ConversationQuery,
  ConversationSummary,
  Message,
  NotificationPreference,
  NotificationQuery,
  RecipientOption,
  SendMessagePayload,
  StartConversationPayload,
  UnreadCounts,
  UploadedAttachment,
} from '@/types/message';

const BASE = '/messages';

export const messageService = {
  // Conversations
  listConversations: (params: ConversationQuery) =>
    api.get<PaginatedData<ConversationSummary>>(`${BASE}/conversations`, { params }),
  getConversation: (id: string) => api.get<Conversation>(`${BASE}/conversations/${id}`),
  startConversation: (payload: StartConversationPayload) =>
    api.post<Conversation>(`${BASE}/conversations`, payload),

  listMessages: (id: string, params: { page?: number; limit?: number; before?: string }) =>
    api.get<PaginatedData<Message>>(`${BASE}/conversations/${id}/messages`, { params }),
  sendMessage: (id: string, payload: SendMessagePayload) =>
    api.post<Message>(`${BASE}/conversations/${id}/messages`, payload),
  deleteMessage: (conversationId: string, messageId: string) =>
    api.delete<null>(`${BASE}/conversations/${conversationId}/messages/${messageId}`),

  markConversationRead: (id: string) =>
    api.post<{ readAt: string }>(`${BASE}/conversations/${id}/read`),
  updateParticipation: (id: string, payload: { isArchived?: boolean; isMuted?: boolean }) =>
    api.patch<{ isArchived: boolean; isMuted: boolean }>(`${BASE}/conversations/${id}`, payload),

  listRecipients: (params: { search?: string; role?: UserRole }) =>
    api.get<RecipientOption[]>(`${BASE}/recipients`, { params }),

  uploadAttachments: (files: File[]) => {
    const formData = new FormData();
    for (const file of files) formData.append('attachments', file);
    return api.upload<UploadedAttachment[]>(`${BASE}/attachments`, formData);
  },

  // Notifications
  getUnreadCounts: () => api.get<UnreadCounts>(`${BASE}/unread-count`),
  listNotifications: (params: NotificationQuery) =>
    api.get<PaginatedData<AppNotification>>(`${BASE}/notifications`, { params }),
  markNotificationRead: (id: string) =>
    api.post<AppNotification>(`${BASE}/notifications/${id}/read`),
  markAllNotificationsRead: () =>
    api.post<{ updated: number }>(`${BASE}/notifications/read-all`),

  getNotificationSettings: () =>
    api.get<NotificationPreference[]>(`${BASE}/notification-settings`),
  saveNotificationSettings: (preferences: NotificationPreference[]) =>
    api.put<NotificationPreference[]>(`${BASE}/notification-settings`, { preferences }),
};
