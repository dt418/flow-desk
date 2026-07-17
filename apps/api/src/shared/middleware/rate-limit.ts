import type { MiddlewareHandler } from 'hono';
import { redis } from '../lib/redis';
import { env } from '../lib/prisma';
import { RateLimitError } from '../errors';
import { checkRateLimit } from './rate-limit-core';

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
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? 'unknown'
  );
}

export function rateLimit(opts: RateLimitOptions): MiddlewareHandler {
  const { windowSec, max, keyBy, scope } = opts;

  return async (c, next) => {
    if (env.NODE_ENV === 'test' || (env.SKIP_RATE_LIMIT && env.NODE_ENV !== 'production')) {
      return next();
    }

    const identity = keyBy === 'ip' ? getClientIp(c) : (c.get('auth')?.user?.id ?? getClientIp(c));

    const result = await checkRateLimit({
      redis,
      scope,
      identity,
      windowSec,
      max,
    });

    c.header('X-RateLimit-Limit', String(result.limit));
    c.header('X-RateLimit-Remaining', String(result.remaining));
    c.header('X-RateLimit-Reset', String(result.resetEpoch));

    if (!result.allowed) {
      throw new RateLimitError('Too Many Requests', result.retryAfterSec);
    }

    return next();
  };
}
