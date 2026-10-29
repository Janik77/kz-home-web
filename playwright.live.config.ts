import { defineConfig } from '@playwright/test';
import base from './playwright.config';

if (process.env.LIVE_CORE_ACCEPTANCE !== '1') throw new Error('Opt in with LIVE_CORE_ACCEPTANCE=1; this suite creates and cleans disposable local data.');

export default defineConfig({
  ...base,
  testIgnore: [], testMatch: '**/live-core.spec.ts', retries: 0,
  outputDir: 'test-results/live-core',
  use: { ...base.use, baseURL: 'http://127.0.0.1:5175', trace: 'off', screenshot: 'off', video: 'off' },
  webServer: {
    command: 'npm run dev -- --port 5175 --strictPort', url: 'http://127.0.0.1:5175',
    reuseExistingServer: false,
    env: { VITE_DATA_MODE: 'core', VITE_API_URL: '/core-api', CORE_DEV_PROXY_TARGET: 'http://127.0.0.1:18000' },
  },
});
