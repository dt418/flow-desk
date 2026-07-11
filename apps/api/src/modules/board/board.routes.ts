import { Hono } from 'hono';
import { rateLimit } from '../../shared/middleware/rate-limit';
import { RATE_LIMITS } from '../../shared/lib/rate-limit-policies';
import { requireWorkspaceRole } from '../../shared/middleware/auth';
import { prisma } from '../../shared/lib/prisma';
import { decodeCursor, encodeCursor } from '@flow-desk/shared/pagination';
import type { Prisma } from '@flowdesk/db';

export const boardRouter = new Hono();

boardRouter.use(
  '*',
  rateLimit({ ...RATE_LIMITS.WORKSPACE_LIST, keyBy: 'user', scope: 'board:list' }),
);

boardRouter.get('/', requireWorkspaceRole(['OWNER', 'ADMIN', 'MEMBER', 'GUEST']), async (c) => {
  const workspaceId = c.req.param('workspaceId')!;
  const cursor = c.req.query('cursor');
  const boardId = c.req.query('boardId') || undefined;
  const limitRaw = Number(c.req.query('limit') ?? '50');
  const limit = Number.isFinite(limitRaw) && limitRaw >= 1 && limitRaw <= 100 ? limitRaw : 50;

  const decoded = cursor ? decodeCursor(cursor) : null;
  const cursorWhere: Prisma.ColumnWhereInput | undefined = decoded
    ? {
        OR: [
          { createdAt: { gt: decoded.createdAt } },
          { createdAt: decoded.createdAt, id: { gt: decoded.id } },
        ],
      }
    : undefined;

  // P4-2: when boardId is set, only tasks on that board appear in kanban columns
  const taskWhere: Prisma.TaskWhereInput = {
    deletedAt: null,
    ...(boardId ? { boardId } : {}),
  };

  const columns = await prisma.column.findMany({
    where: { workspaceId, ...(cursorWhere ?? {}) },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: limit + 1,
    include: {
      tasks: {
        where: taskWhere,
        orderBy: { position: 'asc' },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          position: true,
          dueDate: true,
          version: true,
          columnId: true,
          workspaceId: true,
          boardId: true,
          assigneeId: true,
          createdAt: true,
          labelsDeprecated: true,
          assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
        take: 50,
      },
    },
  });

  const hasMore = columns.length > limit;
  const raw = hasMore ? columns.slice(0, limit) : columns;

  const columnIds = raw.map((col) => col.id);
  const taskCounts =
    columnIds.length > 0
      ? await prisma.task.groupBy({
          by: ['columnId'],
          where: { ...taskWhere, columnId: { in: columnIds } },
          _count: { _all: true },
        })
      : [];
  const countByColumn = new Map(taskCounts.map((g) => [g.columnId, g._count._all]));

  const data = raw.map((col) => ({
    ...col,
    taskCount: countByColumn.get(col.id) ?? 0,
    tasks: col.tasks.map((t) => ({
      ...t,
      labels: t.labelsDeprecated,
    })),
  }));
  const last = raw[raw.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

  return c.json({ columns: data, nextCursor });
});
