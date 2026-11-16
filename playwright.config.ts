import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: [['list'], ['./tests/support/diagnostic-reporter.ts']],
  timeout: 20_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000',
    browserName: 'chromium',
    ...(process.platform === 'win32' ? { launchOptions: { channel: 'msedge' as const } } : {}),
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'npm run start',
    url: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});
