import { defineConfig } from '@playwright/test';
import base from './playwright.confirmed-live.config';
const desktop = { width: 1440, height: 1000 };
const mobile = { width: 390, height: 844 };
export default defineConfig({ ...base, testMatch: '**/home-flow-live.spec.ts', timeout: 180_000,
  outputDir: 'test-results/home-flow-live',
  use: { ...base.use, actionTimeout: 15000 },
  projects: [
    { name: 'desktop', use: { viewport: desktop, video: { mode: 'on', size: desktop } } },
    { name: 'mobile', use: { viewport: mobile, video: { mode: 'on', size: mobile }, isMobile: true, hasTouch: true } },
  ],
});
