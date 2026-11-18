import { defineConfig } from '@playwright/test';
import base from './playwright.automation-live.config';
export default defineConfig({ ...base, testMatch: '**/metadata-live.spec.ts', outputDir: 'test-results/metadata-live' });
