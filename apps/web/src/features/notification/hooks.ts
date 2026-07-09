import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationApi } from './api';

// Matches realtimeKeys.notifications() = ['notifications'] so the
// /notifications realtime invalidation refreshes this list.
export const notificationKeys = {
  all: ['notifications'] as const,
  list: (opts?: { unreadOnly?: boolean }) => ['notifications', 'list', opts ?? {}] as const,
};

export function useNotifications() {
  return useQuery({
    queryKey: notificationKeys.list(),
    queryFn: () => notificationApi.list({ limit: 20 }),
    staleTime: 0,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => notificationApi.markRead(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => notificationApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}
