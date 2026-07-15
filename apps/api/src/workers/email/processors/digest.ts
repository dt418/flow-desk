import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { TaskStatus } from '@flowdesk/db';
import { logger } from '../../../shared/lib/logger';
import { emailProvider } from '../../../shared/lib/email-provider';
import { env } from '../../../shared/lib/env';
import { prisma } from '../../../shared/lib/prisma';
import { renderDigestEmail } from '../../../shared/lib/email-templates';
import type { EmailJobData } from '../queue';

export function createDigestEmailWorker() {
  return new Worker<EmailJobData>(
    'email',
    async (job: Job<EmailJobData>) => {
      if (job.name !== 'send') return;
      if (job.data.type !== 'DIGEST') return;

      const { userId, to, metadata, emailJobId } = job.data;
      const workspaceId = metadata?.workspaceId as string | undefined;
      const cadence = (metadata?.cadence as 'DAILY' | 'WEEKLY') ?? 'DAILY';

      if (!emailJobId) {
        logger.warn({ jobId: job.id }, 'digest email missing emailJobId');
        return;
      }

      if (!workspaceId) {
        logger.warn({ jobId: job.id }, 'digest email missing workspaceId');
        return;
      }

      try {
        const tasks = await prisma.task.findMany({
          where: {
            workspaceId,
            assigneeId: userId,
            status: { not: TaskStatus.DONE },
            deletedAt: null,
          },
          select: {
            id: true,
            title: true,
            dueDate: true,
            priority: true,
          },
          orderBy: { dueDate: 'asc' },
          take: 50,
        });

        const items = tasks.map((t) => ({
          taskId: t.id,
          taskTitle: t.title,
          taskUrl: `${env.APP_URL}/tasks/${t.id}`,
          workspaceName: '',
          dueAt: t.dueDate?.toISOString() ?? null,
          priority: t.priority,
        }));

        const now = new Date();
        const periodEnd = new Date(now.getTime() + (cadence === 'WEEKLY' ? 7 : 1) * 86400000);

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true, email: true },
        });
        const userName = user?.name ?? 'User';

        const content = renderDigestEmail({
          userName,
          cadence,
          items,
          digestUrl: `${env.APP_URL}/tasks`,
          periodStart: now.toISOString(),
          periodEnd: periodEnd.toISOString(),
        });

        const result = await emailProvider.send({
          to,
          subject: content.subject,
          html: content.html,
          text: content.text,
        });

        await prisma.emailJob.updateMany({
          where: { id: emailJobId },
          data: {
            status: 'SENT',
            completedAt: new Date(),
          },
        });

        logger.info(
          { jobId: job.id, messageId: result.messageId, cadence, itemCount: items.length },
          'digest email sent',
        );
      } catch (err) {
        logger.error({ err, jobId: job.id }, 'digest email failed');

        await prisma.emailJob.updateMany({
          where: { id: emailJobId },
          data: {
            status: 'FAILED',
            failedAt: new Date(),
            error: err instanceof Error ? err.message : String(err),
            attempts: { increment: 1 },
          },
        });

        throw err;
      }
    },
    {
      connection: { url: env.REDIS_URL },
      concurrency: 2,
    },
  );
}

export const digestEmailWorker = createDigestEmailWorker();

digestEmailWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'digest email worker job failed');
});
