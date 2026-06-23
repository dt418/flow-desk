import type { prisma } from '../../shared/lib/prisma';
type PrismaClient = typeof prisma;
import type { LabelColor } from '@flow-desk/shared';

export const createLabel = (
  prisma: PrismaClient,
  data: { workspaceId: string; name: string; color: LabelColor },
) =>
  prisma.taskLabel.create({
    data: { workspaceId: data.workspaceId, name: data.name, color: data.color },
  });

export const findById = (prisma: PrismaClient, id: string) =>
  prisma.taskLabel.findUnique({ where: { id } });

export const findByWorkspace = (prisma: PrismaClient, workspaceId: string) =>
  prisma.taskLabel.findMany({
    where: { workspaceId, deletedAt: null },
    orderBy: { name: 'asc' },
  });

export const countByWorkspace = (prisma: PrismaClient, workspaceId: string) =>
  prisma.taskLabel.count({ where: { workspaceId, deletedAt: null } });

export const update = (
  prisma: PrismaClient,
  id: string,
  data: { name?: string; color?: LabelColor },
) =>
  prisma.taskLabel.update({
    where: { id },
    data: { ...data, version: { increment: 1 } },
  });

export const softDelete = (prisma: PrismaClient, id: string) =>
  prisma.taskLabel.update({ where: { id }, data: { deletedAt: new Date() } });

export const deleteLabel = async (prisma: PrismaClient, id: string) =>
  prisma.taskLabel.delete({ where: { id } }).then(() => ({ count: 1 }));

export const findManyByIds = (prisma: PrismaClient, ids: string[]) =>
  prisma.taskLabel.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true, workspaceId: true, name: true, color: true },
  });

export const countAssignments = (prisma: PrismaClient, labelId: string) =>
  prisma.taskLabelAssignment.count({ where: { labelId, deletedAt: null } });
