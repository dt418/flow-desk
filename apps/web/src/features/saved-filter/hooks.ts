import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateSavedFilterInput,
  UpdateSavedFilterInput,
} from '@flow-desk/shared/saved-filter';
import { savedFilterApi } from './api';

export const savedFilterKeys = {
  list: (workspaceId: string) => ['saved-filters', workspaceId] as const,
};

export function useSavedFilters(workspaceId: string) {
  return useQuery({
    queryKey: savedFilterKeys.list(workspaceId),
    queryFn: () => savedFilterApi.list(workspaceId),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });
}

export function useCreateSavedFilter(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSavedFilterInput) => savedFilterApi.create(workspaceId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: savedFilterKeys.list(workspaceId) });
    },
  });
}

export function useUpdateSavedFilter(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateSavedFilterInput }) =>
      savedFilterApi.update(workspaceId, id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: savedFilterKeys.list(workspaceId) });
    },
  });
}

export function useDeleteSavedFilter(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => savedFilterApi.delete(workspaceId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: savedFilterKeys.list(workspaceId) });
    },
  });
}
