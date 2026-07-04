import type { prisma } from '../../shared/lib/prisma';
import { Prisma, type TaskActivity } from '@flowdesk/db';

type PrismaClient = typeof prisma;

export type TaskActivityWithUser = Prisma.TaskActivityGetPayload<{
  include: { user: { select: { id: true; name: true; avatarUrl: true } } };
}>;

export async function create(
  prisma: PrismaClient,
  data: {
    taskId: string;
    userId: string;
    action: TaskActivity['action'];
    field?: string | null;
    oldValue?: string | null;
    newValue?: string | null;
    metadata?: unknown;
  },
): Promise<TaskActivity> {
  return prisma.taskActivity.create({
    data: {
      taskId: data.taskId,
      userId: data.userId,
      action: data.action,
      field: data.field ?? null,
      oldValue: data.oldValue ?? null,
      newValue: data.newValue ?? null,
      ...(data.metadata !== undefined && data.metadata !== null
        ? { metadata: data.metadata as Prisma.InputJsonValue }
        : { metadata: Prisma.JsonNull }),
    },
  });
}

export async function listByTask(
  prisma: PrismaClient,
  taskId: string,
  opts: { cursor?: string; limit: number },
): Promise<{ data: TaskActivityWithUser[]; nextCursor: string | null }> {
  const limit = Math.min(opts.limit, 100);
  const rows = await prisma.taskActivity.findMany({
    where: { taskId },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
    },
  });
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && data.length > 0 ? (data[data.length - 1]?.id ?? null) : null;
  return { data, nextCursor };
}
