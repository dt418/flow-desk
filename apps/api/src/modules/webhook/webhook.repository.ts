import type { Webhook as PrismaWebhook } from '@flowdesk/db';
import { decodeCursor, encodeCursor } from '@flow-desk/shared/pagination';
import type { ExtendedPrismaClient } from '../../shared/lib/prisma';

// List active webhooks for a workspace (used by record() fan-out)
export async function listActiveByWorkspace(
  prisma: ExtendedPrismaClient,
  workspaceId: string,
): Promise<PrismaWebhook[]> {
  return prisma.webhook.findMany({
    where: { workspaceId, isActive: true, deletedAt: null },
  });
}

// List all webhooks (soft-delete filtered by extension)
export async function list(
  prisma: ExtendedPrismaClient,
  workspaceId: string,
): Promise<PrismaWebhook[]> {
  return prisma.webhook.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function findById(
  prisma: ExtendedPrismaClient,
  id: string,
): Promise<PrismaWebhook | null> {
  return prisma.webhook.findUnique({ where: { id } });
}

export async function create(
  prisma: ExtendedPrismaClient,
  data: { workspaceId: string; url: string; secret: string; events: string[]; isActive: boolean },
): Promise<PrismaWebhook> {
  return prisma.webhook.create({ data });
}

export async function update(
  prisma: ExtendedPrismaClient,
  id: string,
  data: { url?: string; events?: string[]; isActive?: boolean },
): Promise<PrismaWebhook> {
  return prisma.webhook.update({ where: { id }, data });
}

export async function remove(prisma: ExtendedPrismaClient, id: string): Promise<void> {
  await prisma.webhook.update({ where: { id }, data: { deletedAt: new Date() } });
}

// --- Deliveries ---

export async function createDelivery(
  prisma: ExtendedPrismaClient,
  data: { webhookId: string; activityId: string; status: string },
) {
  return prisma.webhookDelivery.create({ data });
}

export async function updateDelivery(
  prisma: ExtendedPrismaClient,
  id: string,
  data: {
    status?: string;
    attemptCount?: { increment: number };
    responseCode?: number | null;
    responseBody?: string | null;
    deliveredAt?: Date | null;
    error?: string | null;
  },
) {
  return prisma.webhookDelivery.update({ where: { id }, data });
}

export async function listDeliveries(
  prisma: ExtendedPrismaClient,
  webhookId: string,
  query: { cursor?: string; limit: number },
) {
  const limit = Math.min(query.limit ?? 20, 100);
  const decoded = query.cursor ? decodeCursor(query.cursor) : null;
  const where = decoded
    ? { webhookId, createdAt: { lt: new Date(decoded.createdAt.toISOString()) } }
    : { webhookId };
  const items = await prisma.webhookDelivery.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  });
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  const last = data[data.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({ sortValue: last.createdAt, createdAt: last.createdAt, id: last.id })
      : null;
  return { data, nextCursor };
}
