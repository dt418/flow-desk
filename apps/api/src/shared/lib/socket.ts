import { Server as SocketServer, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server as HttpServer } from 'node:http';
import { redis } from './redis';
import { verifyAccessToken } from './jwt';
import { logger } from './logger';
import { env } from './prisma';
import { attachPresenceHandlers } from '../../modules/realtime/realtime.gateway';

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

      socket.on('join-workspace', async (data: { workspaceId: string }) => {
        if (typeof data?.workspaceId !== 'string') return;
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
      });

      socket.on('leave-workspace', (data: { workspaceId: string }) => {
        if (typeof data?.workspaceId === 'string') {
          socket.leave(`workspace:${data.workspaceId}`);
        }
      });

      socket.on('join-task', async (data: { taskId: string }) => {
        if (typeof data?.taskId !== 'string') return;
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
      });

      socket.on('leave-task', (data: { taskId: string }) => {
        if (typeof data?.taskId === 'string') {
          socket.leave(`task:${data.taskId}`);
        }
      });

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
