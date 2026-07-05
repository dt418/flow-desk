import type {
  SavedFilter,
  SavedFilterListResponse,
  CreateSavedFilterInput,
  UpdateSavedFilterInput,
} from '@flow-desk/shared/saved-filter';
import { savedFilterListResponseSchema } from '@flow-desk/shared/saved-filter';
import { api } from '@/lib/api';
import { okSchema } from './schemas';

export const savedFilterApi = {
  list(workspaceId: string) {
    const qs = `/api/workspaces/${encodeURIComponent(workspaceId)}/saved-filters`;
    return api<SavedFilterListResponse>(qs, { schema: savedFilterListResponseSchema });
  },

  create(workspaceId: string, body: CreateSavedFilterInput) {
    const path = `/api/workspaces/${encodeURIComponent(workspaceId)}/saved-filters`;
    return api<SavedFilter>(path, { method: 'POST', json: body });
  },

  update(workspaceId: string, id: string, body: UpdateSavedFilterInput) {
    const path = `/api/workspaces/${encodeURIComponent(workspaceId)}/saved-filters/${encodeURIComponent(id)}`;
    return api<SavedFilter>(path, { method: 'PATCH', json: body });
  },

  delete(workspaceId: string, id: string) {
    const path = `/api/workspaces/${encodeURIComponent(workspaceId)}/saved-filters/${encodeURIComponent(id)}`;
    return api<{ ok: boolean }>(path, { method: 'DELETE', schema: okSchema });
  },
};
