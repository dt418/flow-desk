import { api } from '@/lib/api';
import type { Notification } from '@flow-desk/shared/notification';

export interface NotificationsResponse {
  data: Notification[];
  nextCursor: string | null;
  unreadCount: number;
}

export const notificationApi = {
  list(params?: { unreadOnly?: boolean; limit?: number; cursor?: string }) {
    const qs = new URLSearchParams();
    if (params?.unreadOnly) qs.set('unreadOnly', 'true');
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.cursor) qs.set('cursor', params.cursor);
    const q = qs.toString();
    return api<NotificationsResponse>(`/api/notifications${q ? `?${q}` : ''}`);
  },
  markRead(ids: string[]) {
    return api<{ ok: true }>('/api/notifications/read', { method: 'PATCH', json: { ids } });
  },
  markAllRead() {
    return api<{ ok: true }>('/api/notifications/read-all', { method: 'POST' });
  },
};
