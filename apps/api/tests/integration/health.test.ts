import { describe, it, expect } from 'vitest';
import { buildApp } from '../../src/app';
import { env } from '../../src/shared/lib/env';

describe('health + readiness + metrics', () => {
  it('GET /api/health returns liveness ok without deps payload', async () => {
    const app = buildApp();
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; timestamp: string };
    expect(body.status).toBe('ok');
    expect(typeof body.timestamp).toBe('string');
  });

  it('GET /api/ready returns ready when postgres + redis are up', async () => {
    const app = buildApp();
    const res = await app.request('/api/ready');
    // Integration suite requires live postgres + redis.
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      checks: { postgres: boolean; redis: boolean };
    };
    expect(body.status).toBe('ready');
    expect(body.checks.postgres).toBe(true);
    expect(body.checks.redis).toBe(true);
  });

  it('GET /api/health sets security headers', async () => {
    const app = buildApp();
    const res = await app.request('/api/health');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Permissions-Policy')).toContain('camera=()');
    expect(res.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
  });

  it('GET /metrics is open when METRICS_TOKEN unset (test env default)', async () => {
    // Test vitest env does not set METRICS_TOKEN.
    expect(env.METRICS_TOKEN).toBeUndefined();
    const app = buildApp();
    const res = await app.request('/metrics');
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toMatch(/flowdesk_|# HELP/);
  });
});
