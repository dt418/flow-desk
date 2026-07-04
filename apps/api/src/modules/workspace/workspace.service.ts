import { workspaceRepo } from './workspace.repository';
import { BadRequestError } from '../../shared/errors';
import { assertRole } from '../../shared/lib/access';
import type { CursorPaginationQuery } from '@flow-desk/shared/pagination';
import { decodeCursor, encodeCursor } from '@flow-desk/shared/pagination';
import type { Prisma } from '@flowdesk/db';

export const workspaceService = {
  async list(query: CursorPaginationQuery, userId: string) {
    const order: 'asc' | 'desc' = 'desc';
    const decoded = query.cursor ? decodeCursor(query.cursor) : null;
    const cursorWhere: Prisma.WorkspaceWhereInput | undefined = decoded
      ? {
          OR: [
            { createdAt: { lt: decoded.createdAt } },
            { createdAt: decoded.createdAt, id: { lt: decoded.id } },
          ],
        }
      : undefined;
    const items = await workspaceRepo.listForUserCursor(userId, {
      take: query.limit + 1,
      cursorWhere,
      order,
    });
    const hasMore = items.length > query.limit;
    const data = hasMore ? items.slice(0, query.limit) : items;
    const last = data[data.length - 1];
    const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;
    return { data, nextCursor };
  },

  async create(name: string, ownerId: string) {
    if (name.length < 1 || name.length > 80) {
      throw new BadRequestError('Workspace name must be 1-80 chars');
    }
    return workspaceRepo.create({ name, ownerId });
  },

  async rename(workspaceId: string, name: string, userId: string) {
    if (name.length < 1 || name.length > 80) {
      throw new BadRequestError('Workspace name must be 1-80 chars');
    }
    await assertRole(workspaceId, userId, ['OWNER', 'ADMIN']);
    return workspaceRepo.update(workspaceId, { name });
  },

  async softDelete(workspaceId: string, userId: string) {
    await assertRole(workspaceId, userId, ['OWNER']);
    return workspaceRepo.softDelete(workspaceId);
  },
};
