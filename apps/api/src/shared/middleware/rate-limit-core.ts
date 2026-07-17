/**
 * Pure rate-limit counter — unit-testable without Hono/env skip flags.
 * Redis eval script: INCR + EXPIRE on first hit.
 */

export type RateLimitRedis = {
  eval: (script: string, numKeys: number, ...args: string[]) => Promise<unknown>;
  pttl: (key: string) => Promise<number>;
};

export const RATE_LIMIT_SCRIPT = `
  local key = KEYS[1]
  local window = tonumber(ARGV[1])
  local count = redis.call('INCR', key)
  if count == 1 then
    redis.call('EXPIRE', key, window)
  end
  return count
`;

export type RateLimitCheckResult = {
  allowed: boolean;
  count: number;
  remaining: number;
  limit: number;
  resetEpoch: number;
  retryAfterSec: number;
  key: string;
};

export async function checkRateLimit(opts: {
  redis: RateLimitRedis;
  scope: string;
  identity: string;
  windowSec: number;
  max: number;
  nowSec?: number;
}): Promise<RateLimitCheckResult> {
  const nowSec = opts.nowSec ?? Math.floor(Date.now() / 1000);
  const bucket = Math.floor(nowSec / opts.windowSec);
  const key = `rl:{${opts.scope}:${opts.identity}}:${bucket}`;
  const count = (await opts.redis.eval(
    RATE_LIMIT_SCRIPT,
    1,
    key,
    String(opts.windowSec),
  )) as number;
  const resetEpoch = (bucket + 1) * opts.windowSec;
  const remaining = Math.max(0, opts.max - count);
  const allowed = count <= opts.max;
  let retryAfterSec = 0;
  if (!allowed) {
    const ttlMs = await opts.redis.pttl(key);
    retryAfterSec = ttlMs > 0 ? Math.ceil(ttlMs / 1000) : opts.windowSec;
  }
  return {
    allowed,
    count,
    remaining,
    limit: opts.max,
    resetEpoch,
    retryAfterSec,
    key,
  };
}
