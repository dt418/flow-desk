import { useInfiniteQuery } from '@tanstack/react-query';
import { activityApi } from './api';

export const activityKeys = {
  list: (taskId: string) => ['activity', taskId] as const,
};

export function useTaskActivity(taskId: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: activityKeys.list(taskId),
    queryFn: ({ pageParam }) => activityApi.list(taskId, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(taskId) && enabled,
  });
}
