import { logger } from '../../shared/lib/logger';
import { sendEmailWorker } from './processors/send';
import { digestEmailWorker } from './processors/digest';
import { startScheduler, stopScheduler } from './scheduler';
import { redis } from '../../shared/lib/redis';
import { prisma } from '../../shared/lib/prisma';

logger.info('Starting email worker');

startScheduler();

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down email worker');

  // Stop scheduler
  stopScheduler();

  // Close BullMQ workers
  await Promise.all([
    sendEmailWorker.close(),
    digestEmailWorker.close(),
  ]);

  // Close Redis
  await redis.quit();

  // Disconnect Prisma
  await prisma.$disconnect();

  logger.info('Email worker shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

setInterval(() => {}, 1_000);
