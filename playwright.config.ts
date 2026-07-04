import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';

config();

const PORT_WEB = Number(process.env.WEB_PORT ?? 5173);
const PORT_API = Number(process.env.API_PORT ?? 3000);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${PORT_WEB}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: `pnpm --filter @flow-desk/api dev`,
      port: PORT_API,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        PORT: String(PORT_API),
        NODE_ENV: 'test',
        DATABASE_URL:
          process.env.DATABASE_URL ??
          `postgresql://flowdesk:flowdesk@127.0.0.1:${process.env.DB_PORT ?? 5432}/flowdesk_test?schema=public`,
        REDIS_URL: process.env.E2E_REDIS_URL ?? 'redis://127.0.0.1:6379',
        SKIP_RATE_LIMIT: '1',
      },
    },
    {
      command: `pnpm --filter @flow-desk/web dev -- --port ${PORT_WEB}`,
      port: PORT_WEB,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        VITE_DISABLE_DEVTOOLS: '1',
      },
    },
  ],
});
