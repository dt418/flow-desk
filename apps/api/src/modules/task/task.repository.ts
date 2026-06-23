import type { prisma } from '../../shared/lib/prisma';
type PrismaClient = typeof prisma;
import type { Prisma } from '@prisma/client';

const ASSIGNEE_SELECT = { id: true, name: true, email: true, avatarUrl: true } as const;

const FULL_INCLUDE = {
  assignee: { select: ASSIGNEE_SELECT },
  createdBy: { select: ASSIGNEE_SELECT },
  subtasks: { where: { deletedAt: null }, orderBy: { position: 'asc' as const } },
  dependencies: true,
  blockers: true,
  _count: { select: { comments: { where: { deletedAt: null } }, attachments: true } },
} satisfies Prisma.TaskInclude;

export function findActiveById(prisma: PrismaClient, id: string, withRelations = false) {
  return prisma.task.findFirst({
    where: { id, deletedAt: null },
    ...(withRelations ? { include: FULL_INCLUDE } : {}),
  });
}

export function findUniqueRaw(prisma: PrismaClient, id: string) {
  return prisma.task.findUnique({ where: { id } });
}

export function lastPositionInColumn(prisma: PrismaClient, columnId: string) {
  return prisma.task.findFirst({
    where: { columnId, deletedAt: null },
    orderBy: { position: 'desc' },
  });
}

export function create(prisma: PrismaClient, data: Prisma.TaskUncheckedCreateInput) {
  return prisma.task.create({ data });
}

export function update(prisma: PrismaClient, id: string, data: Prisma.TaskUpdateInput) {
  return prisma.task.update({ where: { id }, data });
}

export function softDelete(prisma: PrismaClient, id: string) {
  return prisma.task.update({ where: { id }, data: { deletedAt: new Date() } });
}

export function listColumnTaskIds(prisma: PrismaClient, columnId: string) {
  return prisma.task.findMany({
    where: { columnId, deletedAt: null },
    orderBy: { position: 'asc' },
    select: { id: true },
  });
}

export function findColumn(prisma: PrismaClient, id: string) {
  return prisma.column.findUnique({ where: { id } });
}

export function findDependency(prisma: PrismaClient, blockingTaskId: string, blockedTaskId: string) {
  return prisma.taskDependency.findFirst({ where: { blockingTaskId, blockedTaskId } });
}

export function listBlockersOf(prisma: PrismaClient, blockedTaskId: string) {
  return prisma.taskDependency.findMany({
    where: { blockedTaskId },
    select: { blockingTaskId: true },
  });
}

export function createDependency(prisma: PrismaClient, data: { blockingTaskId: string; blockedTaskId: string }) {
  return prisma.taskDependency.create({ data });
}

export function deleteDependency(prisma: PrismaClient, id: string) {
  return prisma.taskDependency.delete({ where: { id } });
}