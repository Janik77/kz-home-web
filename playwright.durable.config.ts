import {defineConfig} from '@playwright/test';
import base from './playwright.numeric.config';
export default defineConfig({...base,testMatch:'**/durable-ui.spec.ts',outputDir:'test-results/durable-fixture'});
