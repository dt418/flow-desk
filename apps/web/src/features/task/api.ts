import type { CreateTaskInput, Task, UpdateTaskInput } from '@flow-desk/shared/task';
import { api, ApiError } from '@/lib/api';
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

/**
 * Download a CSV export for the current filter set (fetch + blob).
 * Surfaces 413 / API errors as thrown Error so callers can toast.
 */
export async function exportTasksCsv(params: {
  workspaceId: string;
  status?: string;
  priority?: string;
}): Promise<void> {
  const qs = new URLSearchParams({ workspaceId: params.workspaceId });
  if (params.status && params.status !== 'ALL') qs.set('status', params.status);
  if (params.priority && params.priority !== 'ALL') qs.set('priority', params.priority);
  const url = `/api/tasks/export?${qs.toString()}`;

  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    let message = `Export failed (${res.status})`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // ignore non-JSON body
    }
    throw new ApiError(res.status, null, message);
  }

  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^";]+)"?/i.exec(cd);
  const filename = match?.[1] ?? 'tasks-export.csv';

  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
