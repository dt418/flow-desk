import { prisma } from '../../shared/lib/prisma';
import { logger } from '../../shared/lib/logger';
import { enqueueEmail } from './queue';

const CHECK_INTERVAL_MS = 60_000;
const DIGEST_COOLDOWN_MS = 12 * 3600_000;

let intervalId: ReturnType<typeof setInterval> | null = null;

export async function checkDueReminders() {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 24 * 3600_000);

  const dueTasks = await prisma.task.findMany({
    where: {
      dueDate: { gte: now, lte: windowEnd },
      status: { not: 'DONE' as any },
      deletedAt: null,
      assigneeId: { not: null },
    },
    select: {
      id: true,
      title: true,
      dueDate: true,
      assigneeId: true,
      workspaceId: true,
    },
  });

  for (const task of dueTasks) {
    if (!task.assigneeId) continue;

    const existing = await prisma.emailJob.findFirst({
      where: {
        userId: task.assigneeId,
        type: 'DUE_REMINDER' as any,
        status: { in: ['PENDING' as any, 'PROCESSING' as any] },
        createdAt: { gte: new Date(now.getTime() - 24 * 3600_000) },
      },
    });

    if (existing) continue;

    const user = await prisma.user.findUnique({
      where: { id: task.assigneeId },
      select: { name: true, email: true },
    });

    if (!user) continue;

    const dueMs = task.dueDate!.getTime();
    const hoursUntilDue = Math.round((dueMs - now.getTime()) / 3_600_000);

    const jobId = `reminder-${task.id}-${task.assigneeId}`;

    await enqueueEmail(
      {
        userId: task.assigneeId,
        type: 'DUE_REMINDER',
        to: user.email,
        subject: `Reminder: ${task.title} is due in ${hoursUntilDue}h`,
        html: `<p>Hi ${user.name},</p><p>Task <strong>${task.title}</strong> is due in ${hoursUntilDue} hours.</p>`,
        text: `Hi ${user.name},\n\nTask "${task.title}" is due in ${hoursUntilDue} hours.`,
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
      OR: [
        { dailyDigest: true },
        { weeklyDigest: true },
      ],
    },
    select: {
      workspaceId: true,
      dailyDigest: true,
      weeklyDigest: true,
    },
  });

  for (const ws of settings) {
    const cadence = ws.weeklyDigest ? 'WEEKLY' : 'DAILY';

    const cooldownStart = new Date(
      now.getTime() - (cadence === 'WEEKLY' ? 7 : 1) * 24 * 3600_000,
    );

    const recentDigests = await prisma.emailJob.findFirst({
      where: {
        type: 'DIGEST' as any,
        status: 'SENT' as any,
        createdAt: { gte: cooldownStart },
      },
    });

    if (recentDigests) continue;

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: ws.workspaceId },
      select: { userId: true },
    });

    for (const member of members) {
      const user = await prisma.user.findUnique({
        where: { id: member.userId },
        select: { name: true, email: true },
      });

      if (!user) continue;

      const existing = await prisma.emailJob.findFirst({
        where: {
          userId: member.userId,
          type: 'DIGEST' as any,
          status: { in: ['PENDING' as any, 'PROCESSING' as any] },
          createdAt: { gte: new Date(now.getTime() - DIGEST_COOLDOWN_MS) },
        },
      });

      if (existing) continue;

      const today = now.toISOString().slice(0, 10);
      const jobId = `digest-${ws.workspaceId}-${member.userId}-${today}`;

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
        },
        { jobId },
      );

      logger.info(
        { workspaceId: ws.workspaceId, userId: member.userId, cadence },
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
