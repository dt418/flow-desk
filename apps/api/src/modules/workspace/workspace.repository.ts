import { prisma } from '../../shared/lib/prisma';
import type { Prisma } from '@flowdesk/db';

export const workspaceRepo = {
  findById: (id: string) => prisma.workspace.findFirst({ where: { id, deletedAt: null } }),

  listForUser: (userId: string) =>
    prisma.workspace.findMany({
      where: { members: { some: { userId } }, deletedAt: null },
      include: {
        _count: { select: { members: true, tasks: true } },
        members: { where: { userId }, select: { role: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),

  listForUserCursor: (
    userId: string,
    args: {
      take: number;
      cursorWhere: Prisma.WorkspaceWhereInput | undefined;
      order: 'asc' | 'desc';
    },
  ) =>
    prisma.workspace.findMany({
      where: {
        members: { some: { userId } },
        deletedAt: null,
        ...(args.cursorWhere ?? {}),
      },
      include: {
        _count: { select: { members: true, tasks: true } },
        members: { where: { userId }, select: { role: true } },
      },
      orderBy: [{ createdAt: args.order }, { id: args.order }],
      take: args.take,
    }),

  create: (data: { name: string; ownerId: string }) =>
    prisma.workspace.create({
      data: {
        ...data,
        slug: `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        members: { create: { userId: data.ownerId, role: 'OWNER' } },
        columns: {
          create: [
            { name: 'Backlog', position: 0, isDoneColumn: false },
            { name: 'Todo', position: 1, isDoneColumn: false },
            { name: 'In Progress', position: 2, isDoneColumn: false },
            { name: 'Done', position: 3, isDoneColumn: true },
          ],
        },
      },
    }),

  softDelete: (id: string) =>
    prisma.workspace.update({ where: { id }, data: { deletedAt: new Date() } }),

  update: (id: string, data: { name?: string; description?: string }) =>
    prisma.workspace.update({ where: { id }, data }),
};
