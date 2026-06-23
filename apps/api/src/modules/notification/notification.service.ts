import type { prisma } from '../../shared/lib/prisma';
type PrismaClient = typeof prisma;
import type { ListNotificationsQuery, MarkReadInput } from '@flow-desk/shared/notification';
import { decodeCursor, encodeCursor } from '@flow-desk/shared/pagination';
import * as repo from './notification.repository';

export async function listNotifications(prisma: PrismaClient, userId: string, query: ListNotificationsQuery) {
  const baseWhere = query.unreadOnly ? { readAt: null } : {};
  const decoded = query.cursor ? decodeCursor(query.cursor) : null;
  const cursorWhere = decoded
    ? {
        AND: [
          baseWhere,
          {
            OR: [
              { createdAt: { lt: decoded.createdAt } },
              { createdAt: decoded.createdAt, id: { lt: decoded.id } },
            ],
          },
        ],
      }
    : undefined;
  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId, ...(cursorWhere ?? baseWhere) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  const hasMore = items.length > query.limit;
  const data = hasMore ? items.slice(0, query.limit) : items;
  const last = data[data.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;
  return { data, nextCursor, unreadCount };
}

export async function markRead(prisma: PrismaClient, userId: string, body: MarkReadInput) {
  const result = await repo.markRead(prisma, userId, body.ids);
  return { updated: result.count };
}

export async function markAllRead(prisma: PrismaClient, userId: string) {
  const result = await repo.markAllRead(prisma, userId);
  return { updated: result.count };
}