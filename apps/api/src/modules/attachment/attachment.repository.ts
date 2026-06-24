import type { Prisma } from '@flowdesk/db';
import type { prisma } from '../../shared/lib/prisma';
type PrismaClient = typeof prisma;

export function findTaskWorkspace(prisma: PrismaClient, id: string) {
  return prisma.task.findUnique({ where: { id, deletedAt: null }, select: { workspaceId: true } });
}

export function listByTask(prisma: PrismaClient, taskId: string) {
  return prisma.attachment.findMany({ where: { taskId }, orderBy: { createdAt: 'desc' } });
}

export function findById(prisma: PrismaClient, id: string) {
  return prisma.attachment.findUnique({
    where: { id },
    select: { taskId: true, mimeType: true, filename: true, storagePath: true },
  });
}

export function create(prisma: PrismaClient, data: Prisma.AttachmentUncheckedCreateInput) {
  return prisma.attachment.create({ data });
}