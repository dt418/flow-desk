import type { Prisma } from '@flowdesk/db';
import type { prisma } from '../../shared/lib/prisma';
type PrismaClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export function findByTask(
  prisma: PrismaClient,
  taskId: string,
  opts: { skip: number; take: number },
) {
  return prisma.comment.findMany({
    where: { taskId, deletedAt: null, parentCommentId: null },
    orderBy: { createdAt: 'asc' },
    include: {
      author: { select: { id: true, name: true, email: true, avatarUrl: true } },
      _count: { select: { replies: { where: { deletedAt: null } } } },
    },
    skip: opts.skip,
    take: opts.take,
  });
}

export function findUniqueRaw(prisma: PrismaClient, id: string) {
  return prisma.comment.findUnique({ where: { id } });
}

export function create(prisma: PrismaClient, data: Prisma.CommentUncheckedCreateInput) {
  return prisma.comment.create({ data });
}

export function updateContent(prisma: PrismaClient, id: string, content: string) {
  return prisma.comment.update({ where: { id }, data: { content, editedAt: new Date() } });
}

export function softDelete(prisma: PrismaClient, id: string) {
  return prisma.comment.update({ where: { id }, data: { deletedAt: new Date() } });
}

export function listWorkspaceMembers(prisma: PrismaClient, workspaceId: string) {
  return prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: { select: { id: true, name: true } } },
  });
}

export function createManyNotifications(
  prisma: PrismaClient,
  data: Prisma.NotificationCreateManyInput[],
) {
  return prisma.notification.createMany({ data });
}

export function findNotificationsSince(
  prisma: PrismaClient,
  userIds: string[],
  type: string,
  since: Date,
) {
  return prisma.notification.findMany({
    where: {
      userId: { in: userIds },
      type: type as Prisma.NotificationWhereInput['type'],
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'asc' },
  });
}
