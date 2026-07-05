import { createWebhookWorker } from './queue';
import { logger } from '../../shared/lib/logger';

let webhookWorker: Awaited<ReturnType<typeof createWebhookWorker>>;

async function shutdown() {
  if (webhookWorker) {
    logger.info('Shutting down webhook worker...');
    await webhookWorker.close();
  }
}

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received');
  await shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received');
  await shutdown();
  process.exit(0);
});

async function main() {
  try {
    webhookWorker = await createWebhookWorker();
    logger.info('Webhook worker started');
  } catch (error) {
    logger.error({ err: error }, 'Failed to start webhook worker');
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error({ err: error }, 'Webhook worker error');
  process.exit(1);
});
