import { defineConfig } from '@playwright/test';
import base from './playwright.confirmed-live.config';
export default defineConfig({ ...base,
  testMatch: process.env.SCENE_VISUAL_ONLY ? '**/scene-visual.spec.ts' : ['**/scene-live.spec.ts', '**/scene-visual.spec.ts'],
  timeout: 150_000,
  webServer: { ...base.webServer, ...(process.env.SCENE_WEB_ROOT ? { cwd: process.env.SCENE_WEB_ROOT } : {}) },
});
