import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateTaskInput, UpdateTaskInput } from '@flow-desk/shared/task';
import { taskApi } from './api';

export const taskKeys = {
  board: (workspaceId: string) => ['board', workspaceId] as const,
};

export function useCreateTask(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTaskInput) => taskApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: taskKeys.board(workspaceId) });
    },
  });
}

export function useUpdateTask(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateTaskInput }) =>
      taskApi.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: taskKeys.board(workspaceId) });
    },
  });
}

export function useDeleteTask(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => taskApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: taskKeys.board(workspaceId) });
    },
  });
}

export function useRestoreTask(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => taskApi.restore(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: taskKeys.board(workspaceId) });
    },
  });
}