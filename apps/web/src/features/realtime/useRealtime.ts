import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import { useNamespacedSocket } from '@/lib/socket';

export const realtimeKeys = {
  board: (workspaceId: string) => ['board', workspaceId] as const,
  comments: (taskId: string) => ['comments', taskId] as const,
  notifications: () => ['notifications'] as const,
};

function joinWorkspace(socket: Socket, workspaceId: string) {
  socket.emit('join-workspace', { workspaceId });
}

function leaveWorkspace(socket: Socket, workspaceId: string) {
  socket.emit('leave-workspace', { workspaceId });
}

function joinTask(socket: Socket, taskId: string) {
  socket.emit('join-task', { taskId });
}

function leaveTask(socket: Socket, taskId: string) {
  socket.emit('leave-task', { taskId });
}

export function useRealtime(workspaceId: string, taskId?: string) {
  const qc = useQueryClient();
  const { socket } = useNamespacedSocket('/tasks');

  useEffect(() => {
    if (!workspaceId) return;
    joinWorkspace(socket, workspaceId);

    const invalidateBoard = () =>
      qc.invalidateQueries({ queryKey: realtimeKeys.board(workspaceId) });
    const invalidateLabels = () => qc.invalidateQueries({ queryKey: ['labels', workspaceId] });
    const taskEvents = [
      'task:created',
      'task:updated',
      'task:deleted',
      'task:restored',
      'task:moved',
      'task:subtask:created',
      'task:dependency:added',
    ];
    const handlers: Array<readonly [string, () => void]> = taskEvents.map((evt) => {
      const handler = () => invalidateBoard();
      socket.on(evt, handler);
      return [evt, handler] as const;
    });

    const labelEvents = ['label:created', 'label:updated', 'label:deleted'] as const;
    for (const evt of labelEvents) {
      const handler = () => invalidateLabels();
      socket.on(evt, handler);
      handlers.push([evt, handler] as const);
    }

    socket.on('task:labels-changed', invalidateBoard);
    handlers.push(['task:labels-changed', invalidateBoard] as const);

    return () => {
      leaveWorkspace(socket, workspaceId);
      for (const [evt, handler] of handlers) socket.off(evt, handler);
    };
  }, [socket, workspaceId, qc]);

  useEffect(() => {
    if (!taskId) return;
    const commentsKey = realtimeKeys.comments(taskId);
    joinTask(socket, taskId);

    const invalidateComments = () => qc.invalidateQueries({ queryKey: commentsKey });
    const commentHandlers = (
      ['comment:created', 'comment:updated', 'comment:deleted'] as const
    ).map((evt) => {
      const handler = () => invalidateComments();
      socket.on(evt, handler);
      return [evt, handler] as const;
    });

    return () => {
      leaveTask(socket, taskId);
      for (const [evt, handler] of commentHandlers) socket.off(evt, handler);
    };
  }, [socket, taskId, qc]);
}

export function useNotificationsRealtime() {
  const qc = useQueryClient();
  const { socket } = useNamespacedSocket('/notifications');

  useEffect(() => {
    const handler = () => qc.invalidateQueries({ queryKey: realtimeKeys.notifications() });
    socket.on('notification:new', handler);
    return () => {
      socket.off('notification:new', handler);
    };
  }, [socket, qc]);
}
