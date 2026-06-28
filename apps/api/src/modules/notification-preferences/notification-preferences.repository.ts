import type { prisma } from '../../shared/lib/prisma';
type PrismaClient = typeof prisma;

export async function findWorkspaceSetting(prisma: PrismaClient, workspaceId: string) {
  return prisma.workspaceNotificationSetting.findUnique({ where: { workspaceId } });
}

export async function upsertWorkspaceSetting(
  prisma: PrismaClient,
  workspaceId: string,
  data: Record<string, unknown>,
) {
  return prisma.workspaceNotificationSetting.upsert({
    where: { workspaceId },
    update: data,
    create: { workspaceId, ...data },
  });
}

export async function findUserPreference(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string | null,
) {
  if (workspaceId === null) {
    return prisma.userNotificationPreference.findFirst({ where: { userId, workspaceId: null } });
  }
  return prisma.userNotificationPreference.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
}

export async function upsertUserPreference(
  prisma: PrismaClient,
  userId: string,
  data: { workspaceId?: string | null; [key: string]: unknown },
) {
  const { workspaceId, ...rest } = data;
  const wsId: string | null = workspaceId ?? null;
  if (wsId === null) {
    const existing = await prisma.userNotificationPreference.findFirst({
      where: { userId, workspaceId: null },
    });
    if (existing) {
      return prisma.userNotificationPreference.update({ where: { id: existing.id }, data: rest });
    }
    return prisma.userNotificationPreference.create({ data: { userId, workspaceId: null, ...rest } });
  }
  return prisma.userNotificationPreference.upsert({
    where: { userId_workspaceId: { userId, workspaceId: wsId } },
    update: rest,
    create: { userId, workspaceId: wsId, ...rest },
  });
}
