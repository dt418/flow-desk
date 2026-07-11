import type { ExtendedPrismaClient } from '../../shared/lib/prisma';
import type { Prisma } from '@flowdesk/db';

export async function listByWorkspace(prisma: ExtendedPrismaClient, workspaceId: string) {
  return prisma.automationRule.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function listActiveByTrigger(
  prisma: ExtendedPrismaClient,
  workspaceId: string,
  trigger: string,
) {
  return prisma.automationRule.findMany({
    where: { workspaceId, trigger, isActive: true, deletedAt: null },
  });
}

export async function findById(prisma: ExtendedPrismaClient, id: string) {
  return prisma.automationRule.findUnique({ where: { id } });
}

export async function create(
  prisma: ExtendedPrismaClient,
  data: {
    workspaceId: string;
    name: string;
    trigger: string;
    condition: Prisma.InputJsonValue | typeof Prisma.JsonNull;
    action: Prisma.InputJsonValue;
    isActive: boolean;
  },
) {
  return prisma.automationRule.create({ data });
}

export async function update(
  prisma: ExtendedPrismaClient,
  id: string,
  data: {
    name?: string;
    trigger?: string;
    condition?: Prisma.InputJsonValue | typeof Prisma.DbNull | typeof Prisma.JsonNull;
    action?: Prisma.InputJsonValue;
    isActive?: boolean;
  },
) {
  return prisma.automationRule.update({ where: { id }, data });
}

export async function softDelete(prisma: ExtendedPrismaClient, id: string) {
  await prisma.automationRule.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });
}

export async function createExecution(
  prisma: ExtendedPrismaClient,
  data: { ruleId: string; activityId: string; status: string; error?: string | null },
) {
  return prisma.ruleExecution.create({ data });
}

export async function listExecutions(prisma: ExtendedPrismaClient, ruleId: string, limit = 50) {
  return prisma.ruleExecution.findMany({
    where: { ruleId },
    orderBy: { executedAt: 'desc' },
    take: limit,
  });
}
