import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Tests the real frontend transport/adapter against intercepted contract fixtures.
// This is deliberately separate from live Core verification.
const baseURL = process.env.PLAYWRIGHT_CORE_BASE_URL ?? 'http://127.0.0.1:5174';
export default defineConfig({ ...base, testIgnore: [], testMatch: '**/core.spec.ts',
  outputDir: 'test-results/core',
  use: { ...base.use, baseURL },
  webServer: {
    command: 'npm run dev -- --port 5174 --strictPort', url: baseURL,
    reuseExistingServer: !process.env.CI,
    env: { VITE_DATA_MODE: 'core', VITE_API_URL: '/core-api' },
  },
});
