import type { prisma } from '../../shared/lib/prisma';
type PrismaClient = typeof prisma;

export function findByChannel(
  prisma: PrismaClient,
  channelId: string,
  opts: { skip: number; take: number },
) {
  return prisma.chatMessage.findMany({
    where: { channelId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: opts.take,
    skip: opts.skip,
    include: {
      author: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
  });
}

export function findUnique(prisma: PrismaClient, id: string) {
  return prisma.chatMessage.findUnique({ where: { id } });
}

export function create(prisma: PrismaClient, data: {
  channelId: string;
  authorId: string;
  content: string;
  mentionedUserIds: string[];
}) {
  return prisma.chatMessage.create({
    data,
    include: {
      author: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
  });
}

export function updateContent(prisma: PrismaClient, id: string, content: string) {
  return prisma.chatMessage.update({
    where: { id },
    data: { content, updatedAt: new Date() },
    include: {
      author: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
  });
}

export function softDelete(prisma: PrismaClient, id: string) {
  return prisma.chatMessage.update({ where: { id }, data: { deletedAt: new Date() } });
}
