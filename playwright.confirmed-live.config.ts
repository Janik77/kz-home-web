import { defineConfig } from '@playwright/test';

if (process.env.CONFIRMED_LIVE !== '1' || !process.env.CORE_DEV_PROXY_TARGET) throw new Error('Run through the isolated confirmed-live runner.');
export default defineConfig({
  testDir: './e2e', testMatch: '**/confirmed-live.spec.ts', workers: 1, retries: 0,
  timeout: 150_000, reporter: 'list', outputDir: 'test-results/confirmed-live',
  use: { baseURL: 'http://127.0.0.1:5176', browserName: 'chromium', channel: 'chrome',
    viewport: { width: 1440, height: 1000 }, trace: 'off', screenshot: 'off', video: 'off' },
  webServer: { command: 'npm run dev -- --port 5176 --strictPort', url: 'http://127.0.0.1:5176',
    reuseExistingServer: false, env: { VITE_DATA_MODE: 'core', VITE_API_URL: '/core-api', CORE_DEV_PROXY_TARGET: process.env.CORE_DEV_PROXY_TARGET } },
});
