import { Queue, Worker } from 'bullmq';
import { env } from '../../shared/lib/env';
import { prisma } from '../../shared/lib/prisma';
import { createDelivery, updateDelivery } from '../../modules/webhook/webhook.repository';
import { signWebhookPayload } from '../../modules/webhook/webhook-sign';
import { logger } from '../../shared/lib/logger';

interface WebhookJob {
  webhookId: string;
  activityId: string;
  webhookUrl: string;
  webhookSecret: string;
  activity: {
    action: string;
    field?: string;
    oldValue?: string;
    newValue?: string;
    metadata?: Record<string, unknown>;
  };
}

export const webhookQueue = new Queue<WebhookJob>('webhook', {
  connection: { url: env.REDIS_URL },
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

export async function createWebhookWorker() {
  const worker = new Worker<WebhookJob>(
    'webhook',
    async (job) => {
      const { webhookId, activityId, webhookUrl, webhookSecret, activity } = job.data;

      // Create delivery record
      const delivery = await createDelivery(prisma, {
        webhookId,
        activityId,
        status: 'PROCESSING',
      });

      // Prepare request — body signed with HMAC-SHA256 (X-FlowDesk-Signature)
      const body = JSON.stringify(activity);
      const signature = signWebhookPayload(webhookSecret, body);
      const headers = {
        'Content-Type': 'application/json',
        'X-FlowDesk-Signature': signature,
        'X-FlowDesk-Event': activity.action,
        'X-FlowDesk-Delivery': delivery.id,
      };

      // Send request with timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        // Update delivery record
        await updateDelivery(prisma, delivery.id, {
          status: response.ok ? 'SUCCESS' : 'FAILED',
          responseCode: response.status,
          responseBody: await response.text(),
          deliveredAt: new Date(),
        });
      } catch (error) {
        clearTimeout(timeout);

        // Update delivery record with error
        await updateDelivery(prisma, delivery.id, {
          status: 'ERROR',
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
      }
    },
    {
      connection: { url: env.REDIS_URL },
      concurrency: 3,
      limiter: {
        max: 30,
        duration: 60000,
      },
    },
  );

  worker.on('completed', (job) => {
    logger.info(`Webhook job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Webhook job ${job?.id} failed: ${err.message}`);
  });

  return worker;
}
