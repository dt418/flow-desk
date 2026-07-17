import { describe, it, expect } from 'vitest';
import { checkRateLimit, type RateLimitRedis } from './rate-limit-core';

function memoryRedis(): RateLimitRedis & { store: Map<string, { n: number; exp: number }> } {
  const store = new Map<string, { n: number; exp: number }>();
  return {
    store,
    async eval(_script: string, _numKeys: number, key: string, windowSec: string) {
      const w = Number(windowSec);
      const now = Math.floor(Date.now() / 1000);
      const cur = store.get(key);
      if (!cur || cur.exp <= now) {
        store.set(key, { n: 1, exp: now + w });
        return 1;
      }
      cur.n += 1;
      return cur.n;
    },
    async pttl(key: string) {
      const cur = store.get(key);
      if (!cur) return -2;
      const now = Math.floor(Date.now() / 1000);
      const left = cur.exp - now;
      return left > 0 ? left * 1000 : -1;
    },
  };
}

describe('checkRateLimit', () => {
  it('allows under max and tracks remaining', async () => {
    const redis = memoryRedis();
    const r1 = await checkRateLimit({
      redis,
      scope: 'test',
      identity: 'ip1',
      windowSec: 60,
      max: 3,
      nowSec: 1_000_000,
    });
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);
    expect(r1.limit).toBe(3);

    await checkRateLimit({
      redis,
      scope: 'test',
      identity: 'ip1',
      windowSec: 60,
      max: 3,
      nowSec: 1_000_000,
    });
    const r3 = await checkRateLimit({
      redis,
      scope: 'test',
      identity: 'ip1',
      windowSec: 60,
      max: 3,
      nowSec: 1_000_000,
    });
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it('denies over max with retryAfter', async () => {
    const redis = memoryRedis();
    const opts = {
      redis,
      scope: 'auth',
      identity: 'ip2',
      windowSec: 60,
      max: 2,
      nowSec: 2_000_000,
    };
    await checkRateLimit(opts);
    await checkRateLimit(opts);
    const blocked = await checkRateLimit(opts);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });
});
