import { TaskStatus, type Prisma } from '@flowdesk/db';
import { prisma } from '../../shared/lib/prisma';
import { logger } from '../../shared/lib/logger';
import { enqueueEmail } from './queue';

const CHECK_INTERVAL_MS = 60_000;
const DIGEST_COOLDOWN_MS = 12 * 3600_000;
void DIGEST_COOLDOWN_MS;

let intervalId: ReturnType<typeof setInterval> | null = null;

export async function checkDueReminders() {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 24 * 3600_000);

  const dueTasks = await prisma.task.findMany({
    where: {
      dueDate: { gte: now, lte: windowEnd },
      status: { not: TaskStatus.DONE },
      deletedAt: null,
      assigneeId: { not: null },
    },
    select: {
      id: true,
      title: true,
      dueDate: true,
      assigneeId: true,
      workspaceId: true,
      assignee: { select: { id: true, name: true, email: true } },
    },
  });

  if (dueTasks.length === 0) return;

  const assigneeIds = [
    ...new Set(dueTasks.map((t) => t.assigneeId).filter((id): id is string => Boolean(id))),
  ];
  const recentJobs =
    assigneeIds.length > 0
      ? await prisma.emailJob.findMany({
          where: {
            userId: { in: assigneeIds },
            type: 'DUE_REMINDER',
            status: { in: ['PENDING', 'PROCESSING'] },
            createdAt: { gte: new Date(now.getTime() - 24 * 3600_000) },
          },
          select: { userId: true, payload: true },
        })
      : [];

  const pendingTaskKeys = new Set(
    recentJobs.map((j) => {
      const payload = j.payload as { taskId?: string } | null;
      return `${j.userId}:${payload?.taskId ?? ''}`;
    }),
  );

  for (const task of dueTasks) {
    if (!task.assigneeId || !task.assignee) continue;
    if (pendingTaskKeys.has(`${task.assigneeId}:${task.id}`)) continue;

    const dueMs = task.dueDate!.getTime();
    const hoursUntilDue = Math.round((dueMs - now.getTime()) / 3_600_000);
    const jobId = `reminder-${task.id}-${task.assigneeId}`;

    await enqueueEmail(
      {
        userId: task.assigneeId,
        type: 'DUE_REMINDER',
        to: task.assignee.email,
        subject: `Reminder: ${task.title} is due in ${hoursUntilDue}h`,
        html: `<p>Hi ${task.assignee.name},</p><p>Task <strong>${task.title}</strong> is due in ${hoursUntilDue} hours.</p>`,
        text: `Hi ${task.assignee.name},\n\nTask "${task.title}" is due in ${hoursUntilDue} hours.`,
        metadata: { taskId: task.id, hoursUntilDue },
      },
      { jobId },
    );

    logger.info(
      { taskId: task.id, userId: task.assigneeId, hoursUntilDue },
      'due reminder enqueued',
    );
  }
}

export async function checkDigests() {
  const now = new Date();

  const settings = await prisma.workspaceNotificationSetting.findMany({
    where: {
      OR: [{ dailyDigest: true }, { weeklyDigest: true }],
    },
    select: {
      workspaceId: true,
      dailyDigest: true,
      weeklyDigest: true,
    },
  });

  for (const ws of settings) {
    const cadence = ws.weeklyDigest ? 'WEEKLY' : 'DAILY';

    const cooldownStart = new Date(now.getTime() - (cadence === 'WEEKLY' ? 7 : 1) * 24 * 3600_000);

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: ws.workspaceId },
      select: {
        userId: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (members.length === 0) continue;

    const memberIds = members.map((m) => m.userId);
    const recentDigests = await prisma.emailJob.findMany({
      where: {
        userId: { in: memberIds },
        type: 'DIGEST',
        createdAt: { gte: cooldownStart },
      },
      select: { userId: true },
    });
    const recentDigestUsers = new Set(recentDigests.map((j) => j.userId));

    for (const member of members) {
      const user = member.user;
      if (!user) continue;
      if (recentDigestUsers.has(member.userId)) continue;

      const today = now.toISOString().slice(0, 10);
      const jobId = `digest-${ws.workspaceId}-${member.userId}-${today}`;

      const emailJob = await prisma.emailJob.create({
        data: {
          userId: member.userId,
          type: 'DIGEST',
          payload: {
            workspaceId: ws.workspaceId,
            cadence,
          } as unknown as Prisma.JsonObject,
          status: 'PENDING',
          scheduledAt: new Date(),
        },
      });

      await enqueueEmail(
        {
          userId: member.userId,
          type: 'DIGEST',
          to: user.email,
          subject: '',
          html: '',
          metadata: {
            workspaceId: ws.workspaceId,
            cadence,
          },
          emailJobId: emailJob.id,
        },
        { jobId },
      );

      logger.info(
        { workspaceId: ws.workspaceId, userId: member.userId, cadence, emailJobId: emailJob.id },
        'digest enqueued',
      );
    }
  }
}

export function startScheduler() {
  if (intervalId) return;

  logger.info('Starting email scheduler');

  const tick = async () => {
    try {
      await checkDueReminders();
      await checkDigests();
      // P3-2: process due recurring task templates on the same tick
      const { templateService } = await import('../../modules/template/template.service');
      const created = await templateService.processDue(new Date());
      if (created > 0) {
        logger.info({ created }, 'recurring templates processed');
      }
    } catch (err) {
      logger.error({ err }, 'email scheduler tick failed');
    }
  };

  tick();
  intervalId = setInterval(tick, CHECK_INTERVAL_MS);
}

export function stopScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('Email scheduler stopped');
  }
}
