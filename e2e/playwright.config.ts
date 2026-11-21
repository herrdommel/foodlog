import { defineConfig, devices } from '@playwright/test';

const BACKEND_PORT = 3100;
const FRONTEND_PORT = 5174;
const APP_URL = `http://localhost:${FRONTEND_PORT}`;
const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'mysql://foodlog:foodlog@127.0.0.1:3306/foodlog_test';

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: APP_URL, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'chromium',
      testIgnore: /screenshots\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'screenshots',
      testMatch: /screenshots\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @foodlog/backend exec tsx test/e2e-server.ts',
      url: `http://127.0.0.1:${BACKEND_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NODE_ENV: 'test',
        PORT: String(BACKEND_PORT),
        HOST: '127.0.0.1',
        APP_URL,
        DATABASE_URL,
        API_KEY_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
        AI_MOCK_PROVIDER: 'true',
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: '1025',
        SMTP_FROM: 'Foodlog <foodlog@example.com>',
      },
    },
    {
      command: `pnpm --filter @foodlog/frontend exec vite --port ${FRONTEND_PORT} --strictPort`,
      url: APP_URL,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { API_PROXY_TARGET: `http://127.0.0.1:${BACKEND_PORT}` },
    },
  ],
});
