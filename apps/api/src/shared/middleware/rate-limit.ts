import type { MiddlewareHandler } from 'hono';
import { redis } from '../lib/redis';
import { env } from '../lib/prisma';
import { RateLimitError } from '../errors';

type RateLimitOptions = {
  windowSec: number;
  max: number;
  keyBy: 'ip' | 'user';
  scope: string;
};

function getClientIp(c: { req: { header: (k: string) => string | undefined } }): string {
  const fwd = c.req.header('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  const real = c.req.header('x-real-ip');
  if (real) return real;
  return 'unknown';
}

export function rateLimit(opts: RateLimitOptions): MiddlewareHandler {
  const { windowSec, max, keyBy, scope } = opts;

  return async (c, next) => {
    if (env.NODE_ENV === 'test' || env.SKIP_RATE_LIMIT) {
      return next();
    }

    const identity = keyBy === 'ip' ? getClientIp(c) : (c.get('auth')?.user?.id ?? getClientIp(c));

    const bucket = Math.floor(Date.now() / 1000 / windowSec);
    const key = `rl:${scope}:${identity}:${bucket}`;

    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSec);
    }

    const resetEpoch = (bucket + 1) * windowSec;
    const remaining = Math.max(0, max - count);

    c.header('X-RateLimit-Limit', String(max));
    c.header('X-RateLimit-Remaining', String(remaining));
    c.header('X-RateLimit-Reset', String(resetEpoch));

    if (count > max) {
      throw new RateLimitError('Too Many Requests', windowSec);
    }

    return next();
  };
}
