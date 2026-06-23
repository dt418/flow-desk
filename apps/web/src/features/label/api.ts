import { api } from '@/lib/api';
import type { Label, CreateLabelInput, UpdateLabelInput } from './types';

interface TaskLabelsPayload {
  data: Label[];
}

export const labelApi = {
  list(workspaceId: string) {
    return api<{ labels: Label[] }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/labels`,
    );
  },
  create(workspaceId: string, body: CreateLabelInput) {
    return api<{ label: Label }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/labels`,
      { method: 'POST', json: body },
    );
  },
  update(workspaceId: string, labelId: string, body: UpdateLabelInput) {
    return api<{ label: Label }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/labels/${encodeURIComponent(labelId)}`,
      { method: 'PATCH', json: body },
    );
  },
  remove(workspaceId: string, labelId: string) {
    return api<{ ok: true }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/labels/${encodeURIComponent(labelId)}`,
      { method: 'DELETE' },
    );
  },
  taskLabels(workspaceId: string, taskId: string) {
    return api<TaskLabelsPayload>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(taskId)}/labels`,
    ).then((r) => r.data);
  },
  assign(workspaceId: string, taskId: string, labelId: string) {
    return api<{ ok: true }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(taskId)}/labels`,
      { method: 'POST', json: { labelId } },
    );
  },
  unassign(workspaceId: string, taskId: string, labelId: string) {
    return api<{ ok: true }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(taskId)}/labels/${encodeURIComponent(labelId)}`,
      { method: 'DELETE' },
    );
  },
};
