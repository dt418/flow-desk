import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateTaskInput } from '@flow-desk/shared/task';
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
