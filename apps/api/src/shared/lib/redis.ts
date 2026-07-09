import Redis from 'ioredis';
import { env } from './prisma';
import { logger } from './logger';

const globalForRedis = globalThis as unknown as { redis?: Redis };

export const redis =
  globalForRedis.redis ??
  new Redis(env.REDIS_URL, {
    // null = infinite retries. With a finite cap, ioredis throws
    // MaxRetriesPerRequestError on every queued command during a blip,
    // and an unhandled rejection on that throw took the process down.
    maxRetriesPerRequest: null,
    lazyConnect: false,
    enableReadyCheck: true,
  });

// ponytail: log connection errors instead of letting ioredis' unhandled 'error'
// event crash the process (port-starvation bugs handed us ECONNREFUSED → die).
redis.on('error', (e) => {
  logger.error({ err: e.message }, 'redis connection error');
});

if (env.NODE_ENV !== 'production') globalForRedis.redis = redis;
