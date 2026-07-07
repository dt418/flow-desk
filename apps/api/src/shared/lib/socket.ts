import { Server as SocketServer, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server as HttpServer } from 'node:http';
import type { ZodSchema } from 'zod';
import { redis } from './redis';
import { verifyAccessToken } from './jwt';
import { logger } from './logger';
import { env } from './prisma';
import { parseCookieToken } from './cookie';
import { attachPresenceHandlers } from '../../modules/realtime/realtime.gateway';
import { SOCKET_EVENTS } from '@flow-desk/shared/socket-events';
import {
  joinWorkspaceSchema,
  leaveWorkspaceSchema,
  joinTaskSchema,
  leaveTaskSchema,
  conversationJoinSchema,
  conversationLeaveSchema,
  typingStartSchema,
  typingStopSchema,
  messageReadSchema,
  messageSendSchema,
} from '../../modules/realtime/schemas';

const CHAT_PRESENCE_PREFIX = 'chat:presence:';
const CHAT_PRESENCE_KEY = (channelId: string) => `${CHAT_PRESENCE_PREFIX}${channelId}`;

// ponytail: simple Redis INCR rate limit for sockets. No sliding window needed
// for these guard rails — fixed bucket is enough to block abuse.
async function socketRateLimit(
  key: string,
  windowSec: number,
  max: number,
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  if (env.NODE_ENV === 'test') return { allowed: true, retryAfterMs: 0 };
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const redisKey = `rl:socket:${key}:${bucket}`;
  const count = (await redis.incr(redisKey)) as number;
  if (count === 1) await redis.expire(redisKey, windowSec);
  const pttl = await redis.pttl(redisKey);
  const retryAfterMs = pttl > 0 ? pttl : 0;
  return { allowed: count <= max, retryAfterMs };
}

async function broadcastChatPresence(io: SocketServer, channelId: string): Promise<void> {
  const viewers = await redis.smembers(CHAT_PRESENCE_KEY(channelId));
  io.of('/collab').to(`conversation:${channelId}`).emit('presence:update', {
    channelId,
    viewers,
  });
}

// ponytail: small Zod wrapper for socket.io handlers. The earlier version
// assumed `socket` was the second arg of the handler — socket.io v4 passes
// `(payload, ack)`, so the `socket.emit` inside it threw
// `Cannot read properties of undefined`, breaking the event loop and
// sometimes killing subsequent emits. Returns a function that takes the
// calling socket and returns the (data) handler so emit / join / leave work.
export function withValidation<T>(
  schema: ZodSchema<T>,
  handler: (data: T, socket: Socket) => void | Promise<void>,
) {
  return (socket: Socket) => (data: unknown, _ack?: (...args: unknown[]) => void) => {
    const result = schema.safeParse(data);
    if (!result.success) {
      socket.emit(SOCKET_EVENTS.Error, {
        type: 'validation',
        message: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', '),
      });
      return;
    }
    return handler(result.data, socket);
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
  setPubSubClients(pubClient, subClient);

  // Auth middleware — apply to EACH namespace. io.use() only covers the
  // default '/' namespace, which no client connects to; /tasks /collab
  // /notifications were skipping auth → socket.data.userId stayed undefined
  // → prisma 'userId is missing' on join-workspace.
  const authMiddleware = async (socket: Socket, next: (err?: Error) => void) => {
    const cookieToken = parseCookieToken(
      socket.handshake.headers.cookie as string | undefined,
      'access_token',
    );
    const token =
      (socket.handshake.auth?.token as string | undefined) ??
      socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '') ??
      cookieToken ??
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
    ns.on('connection', async (socket) => {
      const userId = socket.data.userId as string;

      // C14: connection rate limit — 30/min per user per namespace
      const connLimit = await socketRateLimit(`conn:${ns.name}:${userId}`, 60, 30);
      if (!connLimit.allowed) {
        socket.emit(SOCKET_EVENTS.Error, {
          type: 'rate_limit',
          message: 'Too many connections',
          retryAfterMs: connLimit.retryAfterMs,
        });
        socket.disconnect(true);
        return;
      }

      socket.join(`user:${userId}`);

      socket.on(
        'join-workspace',
        withValidation(joinWorkspaceSchema, async (data, socket) => {
          const rl = await socketRateLimit(`evt:join-workspace:${userId}`, 60, 10);
          if (!rl.allowed) {
            socket.emit(SOCKET_EVENTS.Error, {
              type: 'rate_limit',
              message: 'Rate limit exceeded',
              retryAfterMs: rl.retryAfterMs,
            });
            return;
          }
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
        })(socket),
      );

      socket.on(
        'leave-workspace',
        withValidation(leaveWorkspaceSchema, (data, socket) => {
          socket.leave(`workspace:${data.workspaceId}`);
        })(socket),
      );

      socket.on(
        'join-task',
        withValidation(joinTaskSchema, async (data, socket) => {
          const rl = await socketRateLimit(`evt:join-task:${userId}`, 60, 20);
          if (!rl.allowed) {
            socket.emit(SOCKET_EVENTS.Error, {
              type: 'rate_limit',
              message: 'Rate limit exceeded',
              retryAfterMs: rl.retryAfterMs,
            });
            return;
          }
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
        })(socket),
      );

      socket.on(
        'leave-task',
        withValidation(leaveTaskSchema, (data, socket) => {
          socket.leave(`task:${data.taskId}`);
        })(socket),
      );

      const chatPresenceChannels = new Set<string>();

      socket.on(
        'conversation:join',
        withValidation(conversationJoinSchema, async (data, socket) => {
          const rl = await socketRateLimit(`evt:conversation-join:${userId}`, 60, 20);
          if (!rl.allowed) {
            socket.emit(SOCKET_EVENTS.Error, {
              type: 'rate_limit',
              message: 'Rate limit exceeded',
              retryAfterMs: rl.retryAfterMs,
            });
            return;
          }
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
            chatPresenceChannels.add(data.channelId);
            await redis.sadd(CHAT_PRESENCE_KEY(data.channelId), userId);
            await broadcastChatPresence(io, data.channelId);
          }
        })(socket),
      );

      socket.on(
        'conversation:leave',
        withValidation(conversationLeaveSchema, async (data, socket) => {
          socket.leave(`conversation:${data.channelId}`);
          chatPresenceChannels.delete(data.channelId);
          await redis.srem(CHAT_PRESENCE_KEY(data.channelId), userId);
          await broadcastChatPresence(io, data.channelId);
        })(socket),
      );

      const typingChannels = new Set<string>();

      socket.on(
        'typing:start',
        withValidation(typingStartSchema, (data, socket) => {
          typingChannels.add(data.channelId);
          socket.to(`conversation:${data.channelId}`).emit('typing:start', {
            channelId: data.channelId,
            userId,
            userName: socket.data.userName,
            userAvatar: socket.data.userAvatar,
          });
        })(socket),
      );

      socket.on(
        'typing:stop',
        withValidation(typingStopSchema, (data, socket) => {
          typingChannels.delete(data.channelId);
          socket.to(`conversation:${data.channelId}`).emit('typing:stop', {
            channelId: data.channelId,
            userId,
          });
        })(socket),
      );

      socket.on(
        'message:read',
        withValidation(messageReadSchema, async (data, _socket) => {
          const rl = await socketRateLimit(`evt:message-read:${userId}`, 60, 30);
          if (!rl.allowed) return;
          const { markRead } = await import('../../modules/chat/chat.message.service');
          const { prisma } = await import('./prisma');
          await markRead(prisma, userId, data.workspaceId, data.channelId, data.messageId);
        })(socket),
      );

      socket.on(
        'message:send',
        async (
          data: unknown,
          ack?: (r: { ok: boolean; message?: unknown; error?: string }) => void,
        ) => {
          const rl = await socketRateLimit(`evt:message-send:${userId}`, 60, 20);
          if (!rl.allowed) {
            ack?.({ ok: false, error: 'rate_limit' });
            return;
          }
          const parsed = messageSendSchema.safeParse(data);
          if (!parsed.success) {
            ack?.({ ok: false, error: 'validation' });
            return;
          }
          const d = parsed.data;
          try {
            const { prisma } = await import('./prisma');
            const { sendMessage } = await import('../../modules/chat/chat.message.service');
            const channel = await prisma.chatChannel.findUnique({
              where: { id: d.channelId, deletedAt: null },
              select: { workspaceId: true },
            });
            if (!channel) {
              ack?.({ ok: false, error: 'channel_not_found' });
              return;
            }
            const message = await sendMessage(prisma, userId, channel.workspaceId, d.channelId, {
              channelId: d.channelId,
              content: d.content,
              mentionedUserIds: d.mentionedUserIds,
              clientMessageId: d.clientMessageId,
            });
            const payload = { channelId: d.channelId, message };
            io.of('/collab')
              .to(`conversation:${d.channelId}`)
              .emit(SOCKET_EVENTS.MessageNew, payload);
            io.of('/collab').to(`user:${userId}`).emit(SOCKET_EVENTS.MessageNew, payload);
            ack?.({ ok: true, message });
          } catch (err) {
            logger.error({ err }, 'message:send failed');
            ack?.({ ok: false, error: 'internal' });
          }
        },
      );

      socket.on('disconnect', async () => {
        for (const channelId of typingChannels) {
          socket.to(`conversation:${channelId}`).emit('typing:stop', {
            channelId,
            userId,
          });
        }
        typingChannels.clear();
        for (const channelId of chatPresenceChannels) {
          await redis.srem(CHAT_PRESENCE_KEY(channelId), userId);
          await broadcastChatPresence(io, channelId).catch((err) =>
            logger.warn({ err }, 'chat presence broadcast failed'),
          );
        }
        chatPresenceChannels.clear();
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
let pubClient: ReturnType<typeof redis.duplicate> | null = null;
let subClient: ReturnType<typeof redis.duplicate> | null = null;

export function getSweeperStop(): (() => void) | null {
  return sweeperStop;
}

export function getPubSubClients(): { pubClient: typeof pubClient; subClient: typeof subClient } {
  return { pubClient, subClient };
}

export function setPubSubClients(
  pub: ReturnType<typeof redis.duplicate>,
  sub: ReturnType<typeof redis.duplicate>,
) {
  pubClient = pub;
  subClient = sub;
}

export type FlowDeskSocket = Socket;
