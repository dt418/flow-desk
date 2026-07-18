import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/*.integration.test.ts', 'tests/integration/**'],
    environment: 'node',
    globals: false,
    setupFiles: ['./tests/setup/unit.ts'],
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-do-not-use-in-prod-32chars+',
      DATABASE_URL: 'postgresql://flowdesk:flowdesk@localhost:5432/flowdesk_test?schema=public',
      REDIS_URL: 'redis://localhost:6390',
      SKIP_RATE_LIMIT: '1',
      LLM_API_KEY: 'sk-test-key-valid',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/shared/types/**'],
      thresholds: { lines: 70, branches: 60, functions: 70, statements: 70 },
    },
  },
  resolve: {
    alias: {
      '@flow-desk/shared': resolve(__dirname, '../../packages/shared/src'),
      '@': resolve(__dirname, 'src'),
    },
  },
});
