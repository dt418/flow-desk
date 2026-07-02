import { prisma } from '../../shared/lib/prisma';
import { enqueueEmail, emailQueue, EmailJobData } from './queue';
import type { Prisma } from '@flowdesk/db';

export async function scheduleDelayed(
  userId: string,
  to: string,
  payload: { subject: string; html: string; text?: string; metadata?: Record<string, unknown> },
  delayMs: number,
) {
  const jobId = `delayed-${userId}-${Date.now()}`;
  const scheduledAt = new Date(Date.now() + delayMs);

  const emailJob = await prisma.emailJob.create({
    data: {
      id: jobId,
      userId,
      type: 'DELAYED',
      payload: payload as unknown as Prisma.JsonObject,
      status: 'PENDING',
      scheduledAt,
    },
  });

  await enqueueEmail(
    {
      userId,
      type: 'DELAYED',
      to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      metadata: payload.metadata,
    },
    { delay: delayMs, jobId },
  );

  return emailJob;
}

export async function cancelDelayed(userId: string, jobId: string) {
  const job = await emailQueue.getJob(jobId);
  if (job) {
    await job.remove();
  }

  await prisma.emailJob.updateMany({
    where: { id: jobId, userId, type: 'DELAYED', status: 'PENDING' },
    data: { status: 'CANCELLED' },
  });
}
