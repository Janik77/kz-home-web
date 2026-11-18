import { defineConfig } from '@playwright/test';
import base from './playwright.automation-live.config';
export default defineConfig({ ...base, testMatch: '**/scene-edit-live.spec.ts', outputDir: 'test-results/scene-edit-live' });
