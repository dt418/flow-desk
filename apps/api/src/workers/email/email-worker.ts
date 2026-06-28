import { logger } from '../../shared/lib/logger';
import { sendEmailWorker } from './processors/send';
import { startScheduler } from './scheduler';

logger.info('Starting email worker');

startScheduler();

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down email worker');
  await sendEmailWorker.close();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

setInterval(() => {}, 1_000);
