import { defineConfig } from '@playwright/test';
import base from './playwright.numeric.config';
export default defineConfig({ ...base, testMatch: '**/metadata-ui.spec.ts', outputDir: 'test-results/metadata-fixture', use: { ...base.use, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { launchOptions: { chromiumSandbox: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } } : {}) } });
