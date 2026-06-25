import type { CreateTaskInput, Task, UpdateTaskInput } from '@flow-desk/shared/task';
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
  update(taskId: string, body: UpdateTaskInput) {
    return api<{ task: Task }>(`/api/tasks/${encodeURIComponent(taskId)}`, {
      method: 'PATCH',
      json: body,
    });
  },
  delete(taskId: string) {
    return api<{ ok: boolean }>(`/api/tasks/${encodeURIComponent(taskId)}`, {
      method: 'DELETE',
    });
  },
  restore(taskId: string) {
    return api<{ task: Task }>(`/api/tasks/${encodeURIComponent(taskId)}/restore`, {
      method: 'POST',
    });
  },
};
