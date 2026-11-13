import { defineConfig } from '@playwright/test';
import base from './playwright.confirmed-live.config';
export default defineConfig({ ...base, testMatch: '**/scene-live.spec.ts', timeout: 150_000 });
