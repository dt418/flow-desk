import Redis from 'ioredis';
import { env } from './prisma';
import { logger } from './logger';

const globalForRedis = globalThis as unknown as { redis?: Redis };

export const redis =
  globalForRedis.redis ??
  new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
    enableReadyCheck: true,
  });

// ponytail: log connection errors instead of letting ioredis' unhandled 'error'
// event crash the process (port-starvation bugs handed us ECONNREFUSED → die).
redis.on('error', (e) => {
  logger.error({ err: e.message }, 'redis connection error');
});

if (env.NODE_ENV !== 'production') globalForRedis.redis = redis;
