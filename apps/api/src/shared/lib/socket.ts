import { Server as SocketServer, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server as HttpServer } from 'node:http';
import { redis } from './redis';
import { verifyAccessToken } from './jwt';
import { logger } from './logger';
import { env } from './env';
import { attachPresenceHandlers } from '../../modules/realtime/realtime.gateway';

export function createSocketServer(httpServer: HttpServer) {
  const io = new SocketServer(httpServer, {
    cors: { origin: env.CORS_ORIGINS, credentials: true },
    path: '/socket.io',
  });

  const pubClient = redis.duplicate();
  const subClient = redis.duplicate();
  io.adapter(createAdapter(pubClient, subClient));

  io.use(async (socket, next) => {
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
  });

  const tasksNs = io.of('/tasks');
  const notificationsNs = io.of('/notifications');
  const collabNs = io.of('/collab');

  for (const ns of [tasksNs, notificationsNs, collabNs]) {
    ns.on('connection', (socket) => {
      const userId = socket.data.userId as string;
      socket.join(`user:${userId}`);

      socket.on('join-workspace', (workspaceId: string) => {
        if (typeof workspaceId === 'string') socket.join(`workspace:${workspaceId}`);
      });

      socket.on('leave-workspace', (workspaceId: string) => {
        if (typeof workspaceId === 'string') socket.leave(`workspace:${workspaceId}`);
      });

      socket.on('join-task', (taskId: string) => {
        if (typeof taskId === 'string') socket.join(`task:${taskId}`);
      });

      socket.on('leave-task', (taskId: string) => {
        if (typeof taskId === 'string') socket.leave(`task:${taskId}`);
      });

      socket.on('disconnect', () => {
        socket.rooms.forEach((room) => {
          if (room !== socket.id) socket.leave(room);
        });
      });
    });
  }

  attachPresenceHandlers(io, redis, '/tasks');

  return io;
}

export type FlowDeskSocket = Socket;
