import { useMutation } from '@tanstack/react-query';
import * as aiApi from './api';

export function useSuggestAssignee(workspaceId: string) {
  return useMutation({
    mutationFn: ({
      taskId,
      title,
      description,
      signal,
    }: {
      taskId?: string;
      title?: string;
      description?: string;
      signal?: AbortSignal;
    }) => aiApi.suggestAssignee(workspaceId, { taskId, title, description }, signal),
  });
}
