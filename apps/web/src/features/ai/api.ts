import { api } from '@/lib/api';
import type { SuggestAssigneeResult } from './types';

export function suggestAssignee(workspaceId: string, body: { taskId?: string; title?: string; description?: string }, signal?: AbortSignal): Promise<SuggestAssigneeResult> {
  return api(`/api/ai/suggest-assignee`, {
    method: 'POST',
    json: { workspaceId, ...body },
    signal,
  });
}
