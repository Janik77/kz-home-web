import { defineConfig } from '@playwright/test';
import base from './playwright.confirmed-live.config';
export default defineConfig({
  ...base, testMatch: '**/state-live.spec.ts', timeout: 150_000,
  outputDir: 'test-results/state-live',
  use: { ...base.use, headless: false, video: 'on', actionTimeout: 10000 },
});
