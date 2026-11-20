import { defineConfig } from '@playwright/test';
import base from './playwright.confirmed-live.config';
export default defineConfig({ ...base, testMatch: '**/home-flow-live.spec.ts', timeout: 180_000,
  outputDir: 'test-results/home-flow-live',
  use: { ...base.use, video: 'on', actionTimeout: 15000 },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
