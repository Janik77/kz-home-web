import { defineConfig } from '@playwright/test';
import base from './playwright.confirmed-live.config';
export default defineConfig({ ...base,
  testMatch: '**/automation-live.spec.ts', timeout: 240_000,
  outputDir: 'test-results/automation-live',
  use: { ...base.use, video: 'on' },
});
