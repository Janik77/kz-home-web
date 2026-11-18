import { defineConfig } from '@playwright/test';
import base from './playwright.core.config';
export default defineConfig({ ...base, testMatch: '**/compact-home-ui.spec.ts', outputDir: 'test-results/compact-home', projects: [390, 768, 1366, 1920].map(width => ({ name: `width-${width}`, use: { viewport: { width, height: width === 390 ? 844 : 1000 }, ...(width === 390 ? { isMobile: true, hasTouch: true } : {}) } })) });
