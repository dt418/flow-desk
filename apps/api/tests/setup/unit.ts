import { vi, beforeEach } from 'vitest';

beforeEach(() => {
  vi.restoreAllMocks();
});

process.env.NODE_ENV = 'test';
const _k = 'JWT_SECRET';
process.env[_k] = process.env[_k] ?? 'test-secret-do-not-use-in-prod-1234567890';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://flowdesk:flowdesk@localhost:5432/flowdesk?schema=public';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
