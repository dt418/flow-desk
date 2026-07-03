import type { Server as SocketServer } from 'socket.io';
import { type Socket } from 'socket.io';
import type { Redis } from 'ioredis';
import { logger } from '../../shared/lib/logger';

interface PresenceRecord {
  socketId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  lastSeen: number;
}

const TTL_MS = 30_000;
const SWEEP_INTERVAL_MS = 10_000;
const PRESENCE_KEY = (wid: string) => `presence:${wid}`;

export interface PresenceUserPayload {
  userId: string;
  name: string;
  avatarUrl: string | null;
  lastSeen: number;
}

async function scanPresenceKeys(redis: Redis, pattern: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor = '0';
  do {
    const [next, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = next;
    keys.push(...batch);
  } while (cursor !== '0');
  return keys;
}

function parseRedisMap(raw: Record<string, string>): PresenceRecord[] {
  return Object.values(raw)
    .map((v) => {
      try {
        return JSON.parse(v) as PresenceRecord;
      } catch {
        return null;
      }
    })
    .filter((x): x is PresenceRecord => x !== null);
}

export async function broadcastPresence(
  redis: Redis,
  namespace: ReturnType<SocketServer['of']>,
  workspaceId: string,
): Promise<void> {
  const raw = await redis.hgetall(PRESENCE_KEY(workspaceId));
  const records = parseRedisMap(raw);
  const now = Date.now();
  const active = records.filter((r) => now - r.lastSeen <= TTL_MS);
  const payload: PresenceUserPayload[] = active.map((r) => ({
    userId: r.userId,
    name: r.name,
    avatarUrl: r.avatarUrl,
    lastSeen: r.lastSeen,
  }));
  namespace.to(`workspace:${workspaceId}`).emit('presence:update', payload);
}

export async function upsertPresence(
  redis: Redis,
  workspaceId: string,
  socketId: string,
  record: Omit<PresenceRecord, 'socketId' | 'lastSeen'>,
): Promise<void> {
  const full: PresenceRecord = { ...record, socketId, lastSeen: Date.now() };
  await redis.hset(PRESENCE_KEY(workspaceId), socketId, JSON.stringify(full));
  await redis.expire(PRESENCE_KEY(workspaceId), Math.ceil(TTL_MS / 1000) * 4);
}

export async function removePresence(
  redis: Redis,
  workspaceId: string,
  socketId: string,
): Promise<void> {
  await redis.hdel(PRESENCE_KEY(workspaceId), socketId);
}

export function attachPresenceHandlers(
  io: SocketServer,
  redis: Redis,
  namespaceName: string = '/tasks',
): { stop: () => void } {
  const namespace = io.of(namespaceName);

  namespace.on('connection', (socket) => {
    const userId = (socket.data?.userId as string | undefined) ?? '';
    if (!userId) {
      logger.warn(
        { socketId: socket.id },
        'presence: socket connected without userId, disconnecting',
      );
      socket.emit('unauthorized', { message: 'missing user context' });
      socket.disconnect(true);
      return;
    }
    const userName = (socket.data.userName as string) ?? `User ${userId.slice(-4)}`;
    const userAvatar = (socket.data.userAvatar as string | null) ?? null;

    socket.on('presence:join', async (payload: { workspaceId?: string }) => {
      const workspaceId = payload?.workspaceId;
      if (typeof workspaceId !== 'string' || !workspaceId) return;
      const { prisma } = await import('../../shared/lib/prisma');
      const member = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId,
          },
        },
        select: { userId: true },
      });
      if (!member) return;
      socket.join(`workspace:${workspaceId}`);
      await upsertPresence(redis, workspaceId, socket.id, {
        userId,
        name: userName,
        avatarUrl: userAvatar,
      });
      await broadcastPresence(redis, namespace, workspaceId);
    });

    socket.on('presence:heartbeat', async (payload: { workspaceId?: string }) => {
      const workspaceId = payload?.workspaceId;
      if (typeof workspaceId !== 'string' || !workspaceId) return;
      await upsertPresence(redis, workspaceId, socket.id, {
        userId,
        name: userName,
        avatarUrl: userAvatar,
      });
    });

    socket.on('presence:leave', async (payload: { workspaceId?: string }) => {
      const workspaceId = payload?.workspaceId;
      if (typeof workspaceId !== 'string' || !workspaceId) return;
      await removePresence(redis, workspaceId, socket.id);
      await broadcastPresence(redis, namespace, workspaceId);
    });

    socket.on('disconnect', async () => {
      const rooms = Array.from(socket.rooms);
      for (const room of rooms) {
        if (room.startsWith('workspace:')) {
          const wid = room.slice('workspace:'.length);
          await removePresence(redis, wid, socket.id);
          await broadcastPresence(redis, namespace, wid).catch((err) =>
            logger.warn({ err }, 'presence broadcast failed'),
          );
        }
      }
    });
  });

  const sweeper = setInterval(async () => {
    try {
      const keys = await scanPresenceKeys(redis, 'presence:*');
      for (const key of keys) {
        const wid = key.slice('presence:'.length);
        const raw = await redis.hgetall(key);
        const records = parseRedisMap(raw);
        const now = Date.now();
        const stale = records.filter((r) => now - r.lastSeen > TTL_MS);
        if (stale.length > 0) {
          await redis.hdel(key, ...stale.map((r) => r.socketId));
          await broadcastPresence(redis, namespace, wid);
        }
      }
    } catch (err) {
      logger.warn({ err }, 'presence sweep failed');
    }
  }, SWEEP_INTERVAL_MS);

  return {
    stop: () => clearInterval(sweeper),
  };
}

export type { Socket };
