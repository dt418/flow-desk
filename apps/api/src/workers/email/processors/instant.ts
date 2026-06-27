import { Worker, Job } from 'bullmq';
import { logger } from '../../../shared/lib/logger';
import { emailProvider } from '../../../shared/lib/email-provider';
import { EmailJobData } from '../queue';
import { prisma } from '../../../shared/lib/prisma';

export function createInstantEmailWorker() {
  return new Worker<EmailJobData>(
    'email',
    async (job: Job<EmailJobData>) => {
      if (job.name !== 'send') return;
      if (job.data.type !== 'INSTANT') return;

      const { userId, to, subject, html, text } = job.data;

      try {
        const result = await emailProvider.send({ to, subject, html, text });

        await prisma.emailJob.updateMany({
          where: { userId, id: job.id ?? undefined },
          data: {
            status: 'SENT',
            completedAt: new Date(),
          },
        });

        logger.info({ jobId: job.id, messageId: result.messageId }, 'instant email sent');
      } catch (err) {
        logger.error({ err, jobId: job.id }, 'instant email failed');

        await prisma.emailJob.updateMany({
          where: { userId, id: job.id ?? undefined },
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
      connection: { url: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379' },
      concurrency: 5,
      limiter: { max: 100, duration: 60_000 },
    },
  );
}

export const instantEmailWorker = createInstantEmailWorker();

instantEmailWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'instant email worker job failed');
});
