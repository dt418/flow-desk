import type { prisma } from '../../shared/lib/prisma';
import type { EffectivePreferences } from '@flow-desk/shared/notification-preferences';
import * as repo from './notification-preferences.repository';

type PrismaClient = typeof prisma;

const DEFAULTS: EffectivePreferences = {
  taskAssignedEmail: true,
  taskMentionedEmail: true,
  taskDueReminderEmail: true,
  taskDueReminderHours: 24,
  commentReplyEmail: true,
  commentMentionEmail: true,
  dailyDigest: false,
  weeklyDigest: true,
  emailDelayMinutes: 0,
};

export async function getEffectivePreferences(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
): Promise<EffectivePreferences> {
  const [userPref, globalPref, workspaceSetting] = await Promise.all([
    repo.findUserPreference(prisma, userId, workspaceId),
    repo.findUserPreference(prisma, userId, null),
    repo.findWorkspaceSetting(prisma, workspaceId),
  ]);

  return {
    taskAssignedEmail:
      userPref?.taskAssignedEmail ??
      globalPref?.taskAssignedEmail ??
      workspaceSetting?.taskAssignedEmail ??
      DEFAULTS.taskAssignedEmail,
    taskMentionedEmail:
      userPref?.taskMentionedEmail ??
      globalPref?.taskMentionedEmail ??
      workspaceSetting?.taskMentionedEmail ??
      DEFAULTS.taskMentionedEmail,
    taskDueReminderEmail:
      userPref?.taskDueReminderEmail ??
      globalPref?.taskDueReminderEmail ??
      workspaceSetting?.taskDueReminderEmail ??
      DEFAULTS.taskDueReminderEmail,
    taskDueReminderHours:
      userPref?.taskDueReminderHours ??
      globalPref?.taskDueReminderHours ??
      workspaceSetting?.taskDueReminderHours ??
      DEFAULTS.taskDueReminderHours,
    commentReplyEmail:
      workspaceSetting?.commentReplyEmail ??
      DEFAULTS.commentReplyEmail,
    commentMentionEmail:
      workspaceSetting?.commentMentionEmail ??
      DEFAULTS.commentMentionEmail,
    dailyDigest:
      userPref?.dailyDigest ??
      globalPref?.dailyDigest ??
      workspaceSetting?.dailyDigest ??
      DEFAULTS.dailyDigest,
    weeklyDigest:
      userPref?.weeklyDigest ??
      globalPref?.weeklyDigest ??
      workspaceSetting?.weeklyDigest ??
      DEFAULTS.weeklyDigest,
    emailDelayMinutes:
      userPref?.emailDelayMinutes ??
      globalPref?.emailDelayMinutes ??
      DEFAULTS.emailDelayMinutes,
  };
}

export async function getUserPreference(prisma: PrismaClient, userId: string, workspaceId: string) {
  return repo.findUserPreference(prisma, userId, workspaceId);
}

export async function upsertUserPreference(
  prisma: PrismaClient,
  userId: string,
  data: { workspaceId?: string | null; [key: string]: unknown },
) {
  return repo.upsertUserPreference(prisma, userId, data);
}

export async function getOrCreateWorkspaceSetting(prisma: PrismaClient, workspaceId: string) {
  return repo.upsertWorkspaceSetting(prisma, workspaceId, {});
}

export async function updateWorkspaceSetting(
  prisma: PrismaClient,
  workspaceId: string,
  data: Record<string, unknown>,
) {
  return repo.upsertWorkspaceSetting(prisma, workspaceId, data);
}
