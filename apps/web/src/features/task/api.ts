import type { CreateTaskInput, Task, UpdateTaskInput } from '@flow-desk/shared/task';
import { api } from '@/lib/api';
import { taskResponseSchema, okResponseSchema } from './schemas';

export const taskApi = {
  create(body: CreateTaskInput) {
    return api<{ task: Task }>('/api/tasks', {
      method: 'POST',
      json: body,
      schema: taskResponseSchema,
    });
  },
  move(taskId: string, body: { columnId: string; position: number; version: number }) {
    return api<{ task: Task }>(`/api/tasks/${encodeURIComponent(taskId)}/move`, {
      method: 'POST',
      json: body,
      schema: taskResponseSchema,
    });
  },
  update(taskId: string, body: UpdateTaskInput) {
    return api<{ task: Task }>(`/api/tasks/${encodeURIComponent(taskId)}`, {
      method: 'PATCH',
      json: body,
      schema: taskResponseSchema,
    });
  },
  delete(taskId: string) {
    return api<{ ok: boolean }>(`/api/tasks/${encodeURIComponent(taskId)}`, {
      method: 'DELETE',
      schema: okResponseSchema,
    });
  },
  restore(taskId: string) {
    return api<{ task: Task }>(`/api/tasks/${encodeURIComponent(taskId)}/restore`, {
      method: 'POST',
      schema: taskResponseSchema,
    });
  },
};
