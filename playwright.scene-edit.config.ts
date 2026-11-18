import { defineConfig } from '@playwright/test';
import base from './playwright.numeric.config';
export default defineConfig({ ...base, testMatch: '**/scene-edit-ui.spec.ts', outputDir: 'test-results/scene-edit-fixture' });
