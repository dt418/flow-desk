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

const RATE_LIMIT_SCRIPT = `
  local key = KEYS[1]
  local window = tonumber(ARGV[1])
  local count = redis.call('INCR', key)
  if count == 1 then
    redis.call('EXPIRE', key, window)
  end
  return count
`;

async function getRedisKeyTTL(key: string): Promise<number> {
  const ttl = await redis.pttl(key);
  return ttl > 0 ? Math.ceil(ttl / 1000) : 0;
}

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

    const bucket = Math.floor(Date.now() / 1000 / windowSec);
    const key = `rl:${scope}:${identity}:${bucket}`;

    const count = (await redis.eval(RATE_LIMIT_SCRIPT, 1, key, String(windowSec))) as number;

    const resetEpoch = (bucket + 1) * windowSec;
    const remaining = Math.max(0, max - count);

    c.header('X-RateLimit-Limit', String(max));
    c.header('X-RateLimit-Remaining', String(remaining));
    c.header('X-RateLimit-Reset', String(resetEpoch));

    if (count > max) {
      const retryAfter = await getRedisKeyTTL(key);
      throw new RateLimitError('Too Many Requests', retryAfter);
    }

    return next();
  };
}
