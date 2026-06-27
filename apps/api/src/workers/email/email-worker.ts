import { logger } from '../../shared/lib/logger';
import { instantEmailWorker } from './processors/instant';

logger.info('Starting email worker (instant processor)');

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down email worker');
  await instantEmailWorker.close();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

setInterval(() => {}, 1_000);
