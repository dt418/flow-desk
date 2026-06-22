import type { Server as SocketServer } from 'socket.io';

export type FlowDeskNamespace = '/tasks' | '/notifications' | '/collab';

export type EventPayload = Record<string, unknown>;

let ioRef: SocketServer | null = null;

export function setIo(io: SocketServer): void {
  ioRef = io;
}

function requireIo(): SocketServer {
  if (!ioRef) throw new Error('socket.io server not initialized');
  return ioRef;
}

export function emitToRoom(
  ns: FlowDeskNamespace,
  room: string,
  event: string,
  payload: EventPayload,
): void {
  requireIo().of(ns).to(room).emit(event, payload);
}

export function emitToNamespace(
  ns: FlowDeskNamespace,
  event: string,
  payload: EventPayload,
): void {
  requireIo().of(ns).emit(event, payload);
}

export function emitToUser(userId: string, event: string, payload: EventPayload): void {
  emitToRoom('/notifications', `user:${userId}`, event, payload);
}

export function emitToWorkspace(
  workspaceId: string,
  event: string,
  payload: EventPayload,
): void {
  emitToRoom('/tasks', `workspace:${workspaceId}`, event, payload);
}

export function emitToTask(taskId: string, event: string, payload: EventPayload): void {
  emitToRoom('/tasks', `task:${taskId}`, event, payload);
}
