import { prisma } from './prisma';
import { redis } from './redis';

export type DependencyCheck = {
  postgres: boolean;
  redis: boolean;
};

export type ReadyResult = {
  status: 'ready' | 'not_ready';
  checks: DependencyCheck;
  timestamp: string;
};

/**
 * Probe Postgres + Redis. Used by GET /api/ready so orchestrators
 * (docker compose, k8s readinessProbe) stop routing until deps answer.
 */
export async function checkReadiness(): Promise<ReadyResult> {
  const checks: DependencyCheck = { postgres: false, redis: false };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.postgres = true;
  } catch {
    checks.postgres = false;
  }

  try {
    const pong = await redis.ping();
    checks.redis = pong === 'PONG';
  } catch {
    checks.redis = false;
  }

  const ok = checks.postgres && checks.redis;
  return {
    status: ok ? 'ready' : 'not_ready',
    checks,
    timestamp: new Date().toISOString(),
  };
}
