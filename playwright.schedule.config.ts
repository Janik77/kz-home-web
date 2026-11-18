import { defineConfig } from '@playwright/test';
import base from './playwright.numeric.config';
export default defineConfig({ ...base, testMatch: '**/schedule-ui.spec.ts', outputDir: 'test-results/schedule-fixture' });
