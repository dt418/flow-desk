import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import { useNamespacedSocket } from '@/lib/socket';

export const realtimeKeys = {
  board: (workspaceId: string) => ['board', workspaceId] as const,
  comments: (taskId: string) => ['comments', taskId] as const,
  notifications: () => ['notifications'] as const,
};

function joinRoom(socket: Socket, room: string) {
  socket.emit('join', { room });
}

function leaveRoom(socket: Socket, room: string) {
  socket.emit('leave', { room });
}

export function useRealtime(workspaceId: string, taskId?: string) {
  const qc = useQueryClient();
  const { socket } = useNamespacedSocket('/tasks');

  useEffect(() => {
    if (!workspaceId) return;
    const workspaceRoom = `workspace:${workspaceId}`;
    joinRoom(socket, workspaceRoom);

    const invalidateBoard = () => qc.invalidateQueries({ queryKey: realtimeKeys.board(workspaceId) });
    const events = [
      'task:created',
      'task:updated',
      'task:deleted',
      'task:moved',
      'task:subtask:created',
      'task:dependency:added',
    ];
    const handlers = events.map((evt) => {
      const handler = () => invalidateBoard();
      socket.on(evt, handler);
      return [evt, handler] as const;
    });

    return () => {
      leaveRoom(socket, workspaceRoom);
      for (const [evt, handler] of handlers) socket.off(evt, handler);
    };
  }, [socket, workspaceId, qc]);

  useEffect(() => {
    if (!taskId) return;
    const taskRoom = `task:${taskId}`;
    const commentsKey = realtimeKeys.comments(taskId);
    joinRoom(socket, taskRoom);

    const invalidateComments = () => qc.invalidateQueries({ queryKey: commentsKey });
    const commentHandlers = (['comment:created', 'comment:updated', 'comment:deleted'] as const).map(
      (evt) => {
        const handler = () => invalidateComments();
        socket.on(evt, handler);
        return [evt, handler] as const;
      },
    );

    return () => {
      leaveRoom(socket, taskRoom);
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