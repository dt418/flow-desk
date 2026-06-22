import type { CreateTaskInput, Task } from '@flow-desk/shared/task';
import { api } from '@/lib/api';

export const taskApi = {
  create(body: CreateTaskInput) {
    return api<{ task: Task }>('/api/tasks', {
      method: 'POST',
      json: body,
    });
  },
  move(taskId: string, body: { columnId: string; position: number; version: number }) {
    return api<{ task: Task }>(`/api/tasks/${encodeURIComponent(taskId)}/move`, {
      method: 'POST',
      json: body,
    });
  },
};
