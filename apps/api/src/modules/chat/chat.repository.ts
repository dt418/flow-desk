import type { prisma } from '../../shared/lib/prisma';
type PrismaClient = typeof prisma;

export function findByWorkspace(prisma: PrismaClient, workspaceId: string) {
  return prisma.chatChannel.findMany({
    where: { workspaceId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, authorId: true, content: true, createdAt: true },
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
        select: { id: true, authorId: true, content: true, createdAt: true },
      },
    },
  });
}

export function create(prisma: PrismaClient, data: {
  workspaceId: string;
  name: string;
  description?: string | null;
  isPrivate: boolean;
}) {
  return prisma.chatChannel.create({ data });
}

export function update(prisma: PrismaClient, id: string, data: {
  name?: string;
  description?: string | null;
  isPrivate?: boolean;
}) {
  return prisma.chatChannel.update({ where: { id }, data });
}

export function softDelete(prisma: PrismaClient, id: string) {
  return prisma.chatChannel.update({ where: { id }, data: { deletedAt: new Date() } });
}
