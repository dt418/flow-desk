import type { TaskActivityWithUser } from '@flow-desk/shared/task';
import { api } from '@/lib/api';
import { activityListResponseSchema } from './schemas';

export const activityApi = {
  list(taskId: string, cursor?: string) {
    const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=20` : '?limit=20';
    return api<{ data: TaskActivityWithUser[]; nextCursor: string | null }>(
      `/api/tasks/${encodeURIComponent(taskId)}/activity${qs}`,
      { schema: activityListResponseSchema },
    );
  },
};
