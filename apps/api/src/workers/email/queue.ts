import { Queue } from 'bullmq';
import { env } from '../../shared/lib/env';

export const EMAIL_QUEUE_NAME = 'email';

export interface EmailJobData {
  userId: string;
  type: 'INSTANT' | 'DELAYED' | 'DIGEST' | 'DUE_REMINDER';
  to: string;
  subject: string;
  html: string;
  text?: string;
  metadata?: Record<string, unknown>;
}

export function createEmailQueue() {
  return new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
    connection: { url: env.REDIS_URL },
    defaultJobOptions: {
      removeOnComplete: 1000,
      removeOnFail: 5000,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
  });
}

export const emailQueue = createEmailQueue();

export async function enqueueEmail(data: EmailJobData, opts?: { delay?: number; jobId?: string }) {
  return emailQueue.add('send', data, {
    delay: opts?.delay,
    jobId: opts?.jobId,
  });
}
