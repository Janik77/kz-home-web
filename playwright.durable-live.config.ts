import {defineConfig} from '@playwright/test';
import base from './playwright.automation-live.config';
export default defineConfig({...base,testMatch:'**/durable-live.spec.ts',outputDir:'test-results/durable-live'});
