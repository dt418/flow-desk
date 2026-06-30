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
  if (env.TRUST_PROXY_HOPS > 0) {
    const xff = c.req.header('x-forwarded-for');
    if (xff) {
      const hops = xff.split(',').map((s) => s.trim());
      return hops[hops.length - env.TRUST_PROXY_HOPS] ?? hops[0] ?? 'unknown';
    }
    return c.req.header('x-real-ip') ?? 'unknown';
  }
  return 'unknown';
}

export function rateLimit(opts: RateLimitOptions): MiddlewareHandler {
  const { windowSec, max, keyBy, scope } = opts;

  return async (c, next) => {
    if (env.NODE_ENV === 'test' || (env.SKIP_RATE_LIMIT && env.NODE_ENV !== 'production')) {
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
