import 'dotenv/config';
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { detectDbPort, buildTestDbUrl } from './tests/setup/db-port';

// Mirror tests/setup/db.ts detectDbPort so the prisma singleton (which reads
// process.env.DATABASE_URL at import) gets the right port without importing
// the ESM-only @flowdesk/db into the config bundle.

const DB_PORT = detectDbPort();
const TEST_DB_URL = process.env.TEST_DB_URL ?? buildTestDbUrl(DB_PORT);

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts', 'src/**/*.integration.test.ts'],
    exclude: ['src/**/*.test.ts'],
    environment: 'node',
    globals: false,
    globalSetup: ['./tests/setup/global-setup.ts'],
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
