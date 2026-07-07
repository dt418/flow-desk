import type { prisma } from '../../shared/lib/prisma';
type PrismaClient = typeof prisma;
import { NotFoundError, ForbiddenError } from '../../shared/errors';

export async function findAndValidateChannel(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
  channelId: string,
) {
  const channel = await prisma.chatChannel.findUnique({ where: { id: channelId } });
  if (!channel || channel.deletedAt || channel.workspaceId !== workspaceId) {
    throw new NotFoundError('Channel not found');
  }
  if (channel.isPrivate) {
    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!member) {
      throw new ForbiddenError('You do not have access to this private channel');
    }
  }
  return channel;
}

export function findByWorkspace(prisma: PrismaClient, workspaceId: string) {
  return prisma.chatChannel.findMany({
    where: { workspaceId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          authorId: true,
          content: true,
          createdAt: true,
          author: { select: { name: true } },
        },
      },
    },
  });
}

export function findUnique(prisma: PrismaClient, id: string) {
  return prisma.chatChannel.findUnique({ where: { id } });
}

export function findUniqueRaw(prisma: PrismaClient, id: string) {
  return prisma.chatChannel.findUnique({
    where: { id },
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          authorId: true,
          content: true,
          createdAt: true,
          author: { select: { name: true } },
        },
      },
    },
  });
}

export function create(
  prisma: PrismaClient,
  data: {
    workspaceId: string;
    name: string;
    description?: string | null;
    isPrivate: boolean;
    scope?: string;
    taskId?: string | null;
  },
) {
  return prisma.chatChannel.create({ data });
}

export function findByScopeAndTask(prisma: PrismaClient, workspaceId: string, taskId: string) {
  return prisma.chatChannel.findFirst({
    where: { workspaceId, scope: 'TASK', taskId, deletedAt: null },
  });
}

export function update(
  prisma: PrismaClient,
  id: string,
  data: {
    name?: string;
    description?: string | null;
    isPrivate?: boolean;
  },
) {
  return prisma.chatChannel.update({ where: { id }, data });
}

export function softDelete(prisma: PrismaClient, id: string) {
  return prisma.chatChannel.update({ where: { id }, data: { deletedAt: new Date() } });
}
