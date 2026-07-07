import type { Server as SocketServer } from 'socket.io';
import type { TaskLabel } from '@flowdesk/db';
import { logger } from './logger';

export type FlowDeskNamespace = '/tasks' | '/notifications' | '/collab';

export type EventPayload = Record<string, unknown>;

export type ServerEmitEvents = {
  'label:created': (payload: { label: TaskLabel }) => void;
  'label:updated': (payload: { label: TaskLabel }) => void;
  'label:deleted': (payload: { labelId: string }) => void;
  'task:labels-changed': (payload: { taskId: string; labelIds: string[] }) => void;
  'workspace:created': (payload: { workspace: { id: string; name: string; slug: string } }) => void;
};

let ioRef: SocketServer | null = null;

export function setIo(io: SocketServer): void {
  ioRef = io;
}

function requireIo(): SocketServer | null {
  return ioRef;
}

export function emitToRoom(
  ns: FlowDeskNamespace,
  room: string,
  event: string,
  payload: EventPayload,
): void {
  const io = requireIo();
  if (!io) return;
  io.of(ns).to(room).emit(event, payload);
}

export function emitToNamespace(ns: FlowDeskNamespace, event: string, payload: EventPayload): void {
  const io = requireIo();
  if (!io) return;
  io.of(ns).emit(event, payload);
}

export function emitToUser(userId: string, event: string, payload: EventPayload): void {
  emitToRoom('/notifications', `user:${userId}`, event, payload);
}

export function emitToWorkspace(workspaceId: string, event: string, payload: EventPayload): void {
  emitToRoom('/tasks', `workspace:${workspaceId}`, event, payload);
}

export function emitToTask(taskId: string, event: string, payload: EventPayload): void {
  emitToRoom('/tasks', `task:${taskId}`, event, payload);
}

type EmitError = { type: 'emit'; event: string; message: string };
type EmitResult = { ok: true } | { ok: false; error: EmitError };

export function safeEmit(fn: () => void, ctx: Record<string, unknown>): EmitResult {
  try {
    fn();
    return { ok: true };
  } catch (err) {
    const event = typeof ctx.event === 'string' ? ctx.event : 'unknown';
    return {
      ok: false,
      error: { type: 'emit', event, message: err instanceof Error ? err.message : String(err) },
    };
  }
}
