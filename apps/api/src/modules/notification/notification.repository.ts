import type { Prisma } from '@flowdesk/db';
import type { prisma } from '../../shared/lib/prisma';
type PrismaClient = typeof prisma;

export function listForUser(
  prisma: PrismaClient,
  userId: string,
  where: Prisma.NotificationWhereInput,
  opts: { skip: number; take: number },
) {
  return prisma.notification.findMany({
    where: { userId, ...where },
    orderBy: { createdAt: 'desc' },
    skip: opts.skip,
    take: opts.take,
  });
}

export function countForUser(
  prisma: PrismaClient,
  userId: string,
  where: Prisma.NotificationWhereInput = {},
) {
  return prisma.notification.count({ where: { userId, ...where } });
}

export function countUnread(prisma: PrismaClient, userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export function markRead(prisma: PrismaClient, userId: string, ids: string[]) {
  return prisma.notification.updateMany({
    where: { id: { in: ids }, userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export function markAllRead(prisma: PrismaClient, userId: string) {
  return prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}
