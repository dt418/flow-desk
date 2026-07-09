import 'dotenv/config';

import type { Server as HttpServer } from 'node:http';
import { serve } from '@hono/node-server';
import { env } from './shared/lib/prisma';
import { logger } from './shared/lib/logger';
import { buildApp } from './app';
import { createSocketServer, getSweeperStop, getPubSubClients } from './shared/lib/socket';
import { setIo } from './shared/lib/socket-events';
import { redis } from './shared/lib/redis';
import { prisma } from './shared/lib/prisma';

// Safety net: an unhandled rejection (e.g. a transient redis or DB hiccup
// on a background socket handler) must not kill the process. Log and move on.
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'unhandledRejection');
});
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'uncaughtException');
});

const app = buildApp();

const port = Number(env.PORT);

const server = serve({ fetch: app.fetch, port }, (info) => {
  logger.info({ port: info.port }, 'FlowDesk API started');
});

const io = createSocketServer(server as HttpServer);
setIo(io);

const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully`);

  // Force exit after 10s if graceful shutdown stalls
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();

  // Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed');
  });

  // Close Socket.IO
  io.close();

  // Stop presence sweeper
  const stopSweeper = getSweeperStop();
  if (stopSweeper) stopSweeper();

  // Close Redis (including pub/sub clients used by the socket adapter)
  const { pubClient, subClient } = getPubSubClients();
  if (pubClient) await pubClient.quit();
  if (subClient) await subClient.quit();
  await redis.quit();

  // Disconnect Prisma
  await prisma.$disconnect();

  logger.info('Shutdown complete');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
