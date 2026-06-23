import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

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
      DATABASE_URL: 'postgresql://flowdesk:flowdesk@localhost:5432/flowdesk_test?schema=public',
      REDIS_URL: 'redis://localhost:6390',
      CORS_ORIGINS: 'http://localhost:5173',
      SKIP_RATE_LIMIT: '1',
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
