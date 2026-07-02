import { prisma } from '../../shared/lib/prisma';
import { ForbiddenError, ConflictError, NotFoundError, BadRequestError } from '../../shared/errors';
import { assertRole, assertMembership } from '../../shared/lib/access';
import { invalidateMembershipCache } from '../../shared/lib/auth-cache';
import type { UserRole, Prisma } from '@flowdesk/db';
import type { CursorPaginationQuery } from '@flow-desk/shared/pagination';
import { decodeCursor, encodeCursor } from '@flow-desk/shared/pagination';

export const memberService = {
  async list(query: CursorPaginationQuery, workspaceId: string, userId: string) {
    await assertMembership(workspaceId, userId);
    const order: 'asc' | 'desc' = 'asc';
    const decoded = query.cursor ? decodeCursor(query.cursor) : null;
    const cursorWhere: Prisma.WorkspaceMemberWhereInput | undefined = decoded
      ? {
          OR: [
            { joinedAt: { gt: decoded.createdAt } },
            { joinedAt: decoded.createdAt, id: { gt: decoded.id } },
          ],
        }
      : undefined;
    const items = await prisma.workspaceMember.findMany({
      where: { workspaceId, ...(cursorWhere ?? {}) },
      include: { user: { select: { id: true, email: true, name: true, avatarUrl: true } } },
      orderBy: [{ joinedAt: order }, { id: order }],
      take: query.limit + 1,
    });
    const hasMore = items.length > query.limit;
    const data = hasMore ? items.slice(0, query.limit) : items;
    const last = data[data.length - 1];
    const nextCursor = hasMore && last ? encodeCursor(last.joinedAt, last.id) : null;
    return { data, nextCursor };
  },

  async inviteByEmail(
    workspaceId: string,
    email: string,
    role: 'ADMIN' | 'MEMBER' | 'GUEST',
    userId: string,
  ) {
    await assertRole(workspaceId, userId, ['OWNER', 'ADMIN']);
    const target = await prisma.user.findUnique({ where: { email } });
    if (!target) throw new NotFoundError('User not registered');

    const existing = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: target.id } },
    });
    if (existing) throw new ConflictError('User already a member');

    return prisma.workspaceMember.create({
      data: { workspaceId, userId: target.id, role },
    }).then(async (result) => {
      await invalidateMembershipCache(workspaceId, target.id);
      return result;
    });
  },

  async changeRole(workspaceId: string, targetUserId: string, newRole: UserRole, userId: string) {
    await assertRole(workspaceId, userId, ['OWNER']);
    if (newRole !== 'OWNER') {
      const ownerCount = await prisma.workspaceMember.count({
        where: { workspaceId, role: 'OWNER' },
      });
      const target = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
      });
      if (target?.role === 'OWNER' && ownerCount <= 1) {
        throw new ForbiddenError('Cannot demote the last owner');
      }
    }
    return prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
      data: { role: newRole },
    }).then(async (result) => {
      await invalidateMembershipCache(workspaceId, targetUserId);
      return result;
    });
  },

  async remove(workspaceId: string, targetUserId: string, userId: string) {
    await assertRole(workspaceId, userId, ['OWNER', 'ADMIN']);
    const target = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    });
    if (target?.role === 'OWNER') {
      const ownerCount = await prisma.workspaceMember.count({
        where: { workspaceId, role: 'OWNER' },
      });
      if (ownerCount <= 1) throw new ForbiddenError('Cannot remove the last owner');
    }
    if (targetUserId === userId) {
      throw new BadRequestError('Cannot remove yourself; transfer ownership first');
    }
    await prisma.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    });
    await invalidateMembershipCache(workspaceId, targetUserId);
  },
};
