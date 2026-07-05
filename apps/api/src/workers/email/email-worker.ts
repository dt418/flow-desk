import { logger } from '../../shared/lib/logger';
import { sendEmailWorker } from './processors/send';
import { digestEmailWorker } from './processors/digest';
import { startScheduler, stopScheduler } from './scheduler';
import { redis } from '../../shared/lib/redis';
import { prisma } from '../../shared/lib/prisma';
import { createWebhookWorker } from '../webhook/queue';

logger.info('Starting email worker');

startScheduler();

let webhookWorker: Awaited<ReturnType<typeof createWebhookWorker>>;

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down email worker');

  // Stop scheduler
  await stopScheduler();

  // Close BullMQ workers
  await Promise.all([sendEmailWorker.close(), digestEmailWorker.close()]);
  if (webhookWorker) {
    await webhookWorker.close();
  }

  // Close Redis
  await redis.quit();

  // Disconnect Prisma
  await prisma.$disconnect();

  logger.info('Email worker shutdown complete');
  process.exit(0);
}

// Start webhook worker
async function startWorkers() {
  try {
    webhookWorker = await createWebhookWorker();
    logger.info('Webhook worker started');
  } catch (error) {
    logger.error({ error }, 'Failed to start webhook worker');
    throw error;
  }
}

// Start workers
startWorkers().catch((error) => {
  logger.error({ error }, 'Worker startup error');
  process.exit(1);
});

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

setInterval(() => {}, 1_000);
