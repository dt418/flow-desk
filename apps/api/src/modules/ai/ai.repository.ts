import type { UserRole } from '../../../generated/prisma/client';
import type { prisma } from '../../shared/lib/prisma';
type PrismaClient = typeof prisma;

export function listMembers(prisma: PrismaClient, workspaceId: string) {
  return prisma.workspaceMember.findMany({
    where: { workspaceId },
    select: {
      role: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });
}

export function findTask(prisma: PrismaClient, id: string) {
  return prisma.task.findUnique({ where: { id, deletedAt: null } });
}

export function groupWorkload(prisma: PrismaClient, workspaceId: string) {
  return prisma.task.groupBy({
    by: ['assigneeId'],
    where: {
      workspaceId,
      deletedAt: null,
      status: { in: ['TODO', 'IN_PROGRESS', 'IN_REVIEW'] },
      assigneeId: { not: null },
    },
    _count: { _all: true },
  });
}

export function listOpenTasksForSchedule(prisma: PrismaClient, workspaceId: string) {
  return prisma.task.findMany({
    where: { workspaceId, deletedAt: null, status: { not: 'DONE' } },
    include: {
      blockers: {
        include: {
          blockingTask: { select: { id: true, dueDate: true, status: true } },
        },
      },
    },
  });
}

export type WorkspaceMemberWithRole = {
  role: UserRole;
  user: { id: string; name: string; email: string };
};

export type WorkloadRow = {
  assigneeId: string | null;
  _count: { _all: number };
};