import { Server as SocketServer, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server as HttpServer } from 'node:http';
import type { ZodSchema } from 'zod';
import { redis } from './redis';
import { verifyAccessToken } from './jwt';
import { logger } from './logger';
import { env } from './prisma';
import { attachPresenceHandlers } from '../../modules/realtime/realtime.gateway';
import { SOCKET_EVENTS } from '@flow-desk/shared/socket-events';
import {
  joinWorkspaceSchema,
  leaveWorkspaceSchema,
  joinTaskSchema,
  leaveTaskSchema,
  conversationJoinSchema,
  conversationLeaveSchema,
} from '../../modules/realtime/schemas';

export function withValidation<T>(schema: ZodSchema<T>, handler: (data: T, socket: Socket) => void) {
  return (data: unknown, socket: Socket) => {
    const result = schema.safeParse(data);
    if (!result.success) {
      socket.emit(SOCKET_EVENTS.Error, {
        type: 'validation',
        message: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', '),
      });
      return;
    }
    handler(result.data, socket);
  };
}

export function createSocketServer(httpServer: HttpServer) {
  const io = new SocketServer(httpServer, {
    cors: { origin: env.CORS_ORIGINS, credentials: true },
    path: '/socket.io',
  });

  const pubClient = redis.duplicate();
  const subClient = redis.duplicate();
  io.adapter(createAdapter(pubClient, subClient));

  // Auth middleware — apply to EACH namespace. io.use() only covers the
  // default '/' namespace, which no client connects to; /tasks /collab
  // /notifications were skipping auth → socket.data.userId stayed undefined
  // → prisma 'userId is missing' on join-workspace.
  const authMiddleware = async (socket: Socket, next: (err?: Error) => void) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ??
      socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '') ??
      '';
    try {
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.userId;
      try {
        const { prisma } = await import('./prisma');
        const user = await prisma.user.findUnique({
          where: { id: payload.userId },
          select: { name: true, avatarUrl: true },
        });
        socket.data.userName = user?.name ?? `User ${payload.userId.slice(-4)}`;
        socket.data.userAvatar = user?.avatarUrl ?? null;
      } catch {
        socket.data.userName = `User ${payload.userId.slice(-4)}`;
        socket.data.userAvatar = null;
      }
      next();
    } catch (err) {
      logger.warn({ err }, 'socket auth failed');
      next(new Error('unauthorized'));
    }
  };

  const tasksNs = io.of('/tasks');
  const notificationsNs = io.of('/notifications');
  const collabNs = io.of('/collab');

  for (const ns of [tasksNs, notificationsNs, collabNs]) {
    ns.use(authMiddleware);
    ns.on('connection', (socket) => {
      const userId = socket.data.userId as string;
      socket.join(`user:${userId}`);

      socket.on(
        'join-workspace',
        withValidation(joinWorkspaceSchema, async (data, socket) => {
          const { prisma } = await import('./prisma');
          const member = await prisma.workspaceMember.findUnique({
            where: {
              workspaceId_userId: {
                workspaceId: data.workspaceId,
                userId,
              },
            },
            select: { userId: true },
          });
          if (member) {
            socket.join(`workspace:${data.workspaceId}`);
          }
        }),
      );

      socket.on(
        'leave-workspace',
        withValidation(leaveWorkspaceSchema, (data, socket) => {
          socket.leave(`workspace:${data.workspaceId}`);
        }),
      );

      socket.on(
        'join-task',
        withValidation(joinTaskSchema, async (data, socket) => {
          const { prisma } = await import('./prisma');
          const task = await prisma.task.findUnique({
            where: { id: data.taskId, deletedAt: null },
            select: { workspaceId: true },
          });
          if (!task) return;
          const member = await prisma.workspaceMember.findUnique({
            where: {
              workspaceId_userId: {
                workspaceId: task.workspaceId,
                userId,
              },
            },
            select: { userId: true },
          });
          if (member) {
            socket.join(`task:${data.taskId}`);
          }
        }),
      );

      socket.on(
        'leave-task',
        withValidation(leaveTaskSchema, (data, socket) => {
          socket.leave(`task:${data.taskId}`);
        }),
      );

      socket.on(
        'conversation:join',
        withValidation(conversationJoinSchema, async (data, socket) => {
          const { prisma } = await import('./prisma');
          const channel = await prisma.chatChannel.findUnique({
            where: { id: data.channelId, deletedAt: null },
            select: { workspaceId: true },
          });
          if (!channel) return;
          const member = await prisma.workspaceMember.findUnique({
            where: {
              workspaceId_userId: {
                workspaceId: channel.workspaceId,
                userId,
              },
            },
            select: { userId: true },
          });
          if (member) {
            socket.join(`conversation:${data.channelId}`);
          }
        }),
      );

      socket.on(
        'conversation:leave',
        withValidation(conversationLeaveSchema, (data, socket) => {
          socket.leave(`conversation:${data.channelId}`);
        }),
      );

      socket.on('disconnect', () => {
        socket.rooms.forEach((room) => {
          if (room !== socket.id) socket.leave(room);
        });
      });
    });
  }

  const { stop } = attachPresenceHandlers(io, redis, '/tasks');
  sweeperStop = stop;

  return io;
}

let sweeperStop: (() => void) | null = null;

export function getSweeperStop(): (() => void) | null {
  return sweeperStop;
}

export type FlowDeskSocket = Socket;
