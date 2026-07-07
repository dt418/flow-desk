import { useEffect, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import { api } from '@/lib/api';
import { useNamespacedSocket } from '@/lib/socket';
import { taskResponseSchema } from '@/features/task/schemas';

export interface MoveTaskInput {
  taskId: string;
  columnId: string;
  position: number;
  version: number;
}

export interface BoardTask {
  id: string;
  columnId: string;
  position: number;
  version: number;
  title: string;
  status: string;
  priority: string;
}

export type BoardColumn = {
  id: string;
  name: string;
  position: number;
  isDoneColumn: boolean;
  tasks: BoardTask[];
};

export type BoardSnapshot = { columns: BoardColumn[] };

export const boardKeys = {
  board: (workspaceId: string) => ['board', workspaceId] as const,
};

/**
 * Pure helper: apply a move to a board snapshot.
 * Returns a NEW snapshot; original is untouched (rollback-friendly).
 */
export function applyMove(snapshot: BoardSnapshot, input: MoveTaskInput): BoardSnapshot {
  const columns = snapshot.columns.map((col) => ({ ...col, tasks: [...col.tasks] }));
  const fromCol = columns.find((c) => c.tasks.some((t) => t.id === input.taskId));
  const toCol = columns.find((c) => c.id === input.columnId);
  if (!fromCol || !toCol) return snapshot;

  const fromIdx = fromCol.tasks.findIndex((t) => t.id === input.taskId);
  if (fromIdx < 0) return snapshot;
  const [task] = fromCol.tasks.splice(fromIdx, 1);
  if (!task) return snapshot;

  const insertAt = Math.min(Math.max(input.position, 0), toCol.tasks.length);
  toCol.tasks.splice(insertAt, 0, { ...task, columnId: toCol.id, position: insertAt });

  return { columns };
}

interface UseMoveTaskOptions {
  workspaceId: string;
  /** Optional external socket (e.g. when sharing a connection). Defaults to the /tasks namespace socket. */
  socket?: Socket;
}

interface MutationContext {
  prev: BoardSnapshot | undefined;
}

export function useMoveTask({ workspaceId, socket: externalSocket }: UseMoveTaskOptions) {
  const qc = useQueryClient();
  const queryKey = useMemo(() => boardKeys.board(workspaceId), [workspaceId]);
  const { socket: defaultSocket } = useNamespacedSocket('/tasks');
  const socket = externalSocket ?? defaultSocket;

  // Cross-client reconciliation: invalidate board when server bumps a version.
  useEffect(() => {
    if (!workspaceId) return;
    const handler = (e: { taskId: string; version: number }) => {
      const data = qc.getQueryData<BoardSnapshot>(queryKey);
      if (!data) return;
      const found = data.columns.flatMap((c) => c.tasks).find((t) => t.id === e.taskId);
      if (found && found.version < e.version) {
        qc.invalidateQueries({ queryKey });
      }
    };
    socket.on('task:moved', handler);
    return () => {
      socket.off('task:moved', handler);
    };
  }, [socket, workspaceId, qc, queryKey]);

  return useMutation<unknown, Error, MoveTaskInput, MutationContext>({
    mutationFn: (input) =>
      api(`/api/tasks/${encodeURIComponent(input.taskId)}/move`, {
        method: 'POST',
        json: {
          columnId: input.columnId,
          position: input.position,
          version: input.version,
        },
        schema: taskResponseSchema,
      }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<BoardSnapshot>(queryKey);
      if (prev) {
        qc.setQueryData<BoardSnapshot>(queryKey, applyMove(prev, input));
      }
      // Broadcast optimistic move so other clients get a hint too.
      socket.emit('task:move', {
        taskId: input.taskId,
        columnId: input.columnId,
        position: input.position,
        version: input.version,
      });
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(queryKey, ctx.prev);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey });
    },
  });
}
