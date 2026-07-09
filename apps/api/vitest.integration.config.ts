import 'dotenv/config';
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

// Mirror tests/setup/db.ts detectDbPort so the prisma singleton (which reads
// process.env.DATABASE_URL at import) gets the right port without importing
// the ESM-only @flowdesk/db into the config bundle.
function detectDbPort(): number {
  const envPort = process.env.TEST_DB_PORT;
  if (envPort) return parseInt(envPort, 10);
  try {
    execSync('pg_isready -h 127.0.0.1 -p 5432 -t 2', { stdio: 'ignore' });
    return 5432;
  } catch {
    // not on 5432
  }
  try {
    const out = execSync(
      'docker inspect flow-desk-postgres-1 --format "{{json .HostConfig.PortBindings}}"',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] },
    ).trim();
    const bindings = JSON.parse(out);
    return parseInt(bindings['5432/tcp']?.[0]?.HostPort ?? '5432', 10);
  } catch {
    return 5432;
  }
}

const DB_PORT = detectDbPort();
const TEST_DB_URL =
  process.env.TEST_DB_URL ??
  `postgresql://flowdesk:postgres@localhost:${DB_PORT}/flowdesk_test?schema=public`;

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts', 'src/**/*.integration.test.ts'],
    exclude: ['src/**/*.test.ts'],
    environment: 'node',
    globals: false,
    setupFiles: ['./tests/setup/integration.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-do-not-use-in-prod-32chars+',
      DATABASE_URL: TEST_DB_URL,
      REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
      CORS_ORIGINS: 'http://localhost:5173',
      SKIP_RATE_LIMIT: '1',
      LLM_API_KEY: 'sk-test-key-valid',
      UPLOAD_DIR: '/tmp/test-uploads',
    },
  },
  resolve: {
    alias: {
      '^@flow-desk/shared$': resolve(__dirname, '../../packages/shared/src'),
      '^@flow-desk/shared/(.*)$': resolve(__dirname, '../../packages/shared/src') + '/$1',
      '@': resolve(__dirname, 'src'),
    },
  },
});
