import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

vi.mock('./redis', () => ({
  redis: {
    ping: vi.fn(),
  },
}));

import { checkReadiness } from './health';
import { prisma } from './prisma';
import { redis } from './redis';

describe('checkReadiness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ready when both dependencies answer', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ '?column?': 1 }]);
    vi.mocked(redis.ping).mockResolvedValueOnce('PONG');

    const result = await checkReadiness();
    expect(result.status).toBe('ready');
    expect(result.checks).toEqual({ postgres: true, redis: true });
  });

  it('returns not_ready when postgres fails', async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(new Error('db down'));
    vi.mocked(redis.ping).mockResolvedValueOnce('PONG');

    const result = await checkReadiness();
    expect(result.status).toBe('not_ready');
    expect(result.checks.postgres).toBe(false);
    expect(result.checks.redis).toBe(true);
  });

  it('returns not_ready when redis fails', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ '?column?': 1 }]);
    vi.mocked(redis.ping).mockRejectedValueOnce(new Error('redis down'));

    const result = await checkReadiness();
    expect(result.status).toBe('not_ready');
    expect(result.checks.postgres).toBe(true);
    expect(result.checks.redis).toBe(false);
  });
});
