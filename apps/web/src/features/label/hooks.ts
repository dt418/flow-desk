import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { labelApi } from './api';
import type { Label, CreateLabelInput, UpdateLabelInput } from './types';

export const labelKeys = {
  all: (workspaceId: string) => ['labels', workspaceId] as const,
  task: (workspaceId: string, taskId: string) => ['labels', workspaceId, 'task', taskId] as const,
};

export function useLabels(workspaceId: string) {
  return useQuery({
    queryKey: labelKeys.all(workspaceId),
    queryFn: () => labelApi.list(workspaceId).then((r) => r.labels),
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
  });
}

export function useCreateLabel(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateLabelInput) => labelApi.create(workspaceId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: labelKeys.all(workspaceId) });
    },
  });
}

export function useUpdateLabel(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ labelId, body }: { labelId: string; body: UpdateLabelInput }) =>
      labelApi.update(workspaceId, labelId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: labelKeys.all(workspaceId) });
    },
  });
}

export function useDeleteLabel(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (labelId: string) => labelApi.remove(workspaceId, labelId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: labelKeys.all(workspaceId) });
    },
  });
}

export function useTaskLabels(workspaceId: string, taskId: string) {
  return useQuery({
    queryKey: labelKeys.task(workspaceId, taskId),
    queryFn: () => labelApi.taskLabels(workspaceId, taskId),
    enabled: Boolean(workspaceId) && Boolean(taskId),
  });
}

export function useToggleTaskLabel(workspaceId: string, taskId: string) {
  const qc = useQueryClient();
  const key = labelKeys.task(workspaceId, taskId);
  return useMutation({
    mutationFn: ({ labelId, assigned }: { labelId: string; assigned: boolean }) =>
      assigned
        ? labelApi.unassign(workspaceId, taskId, labelId)
        : labelApi.assign(workspaceId, taskId, labelId),
    onMutate: async ({ labelId, assigned }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Label[]>(key);
      const known = qc.getQueryData<Label[]>(labelKeys.all(workspaceId)) ?? [];
      const target = known.find((l) => l.id === labelId) ?? prev?.find((l) => l.id === labelId);
      if (!target) return { prev };
      qc.setQueryData<Label[]>(key, () => {
        const list = prev ?? [];
        if (assigned) return list.filter((l) => l.id !== labelId);
        if (list.some((l) => l.id === labelId)) return list;
        return [...list, target];
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
    },
  });
}
