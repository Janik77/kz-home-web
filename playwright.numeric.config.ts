import { defineConfig } from '@playwright/test';
import core from './playwright.core.config';
export default defineConfig({ ...core, testMatch: '**/numeric-ui.spec.ts', outputDir: 'test-results/numeric-fixture', projects: [{ name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } }, { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }] });
