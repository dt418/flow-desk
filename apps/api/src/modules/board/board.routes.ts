import { Hono } from 'hono';
import { rateLimit } from '../../shared/middleware/rate-limit';
import { RATE_LIMITS } from '../../shared/lib/rate-limit-policies';
import { requireWorkspaceRole } from '../../shared/middleware/auth';
import { prisma } from '../../shared/lib/prisma';
import { decodeCursor, encodeCursor } from '@flow-desk/shared/pagination';
import type { Prisma } from '@prisma/client';

export const boardRouter = new Hono();

boardRouter.use(
  '*',
  rateLimit({ ...RATE_LIMITS.WORKSPACE_LIST, keyBy: 'user', scope: 'board:list' }),
);

boardRouter.get(
  '/',
  requireWorkspaceRole(['OWNER', 'ADMIN', 'MEMBER', 'GUEST']),
  async (c) => {
    const workspaceId = c.req.param('workspaceId')!;
    const cursor = c.req.query('cursor');
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

    const columns = await prisma.column.findMany({
      where: { workspaceId, ...(cursorWhere ?? {}) },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      include: {
        tasks: {
          where: { deletedAt: null },
          orderBy: { position: 'asc' },
          include: {
            assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
          },
          take: 50,
        },
      },
    });

    const hasMore = columns.length > limit;
    const data = hasMore ? columns.slice(0, limit) : columns;
    const last = data[data.length - 1];
    const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

    return c.json({ columns: data, nextCursor });
  },
);
