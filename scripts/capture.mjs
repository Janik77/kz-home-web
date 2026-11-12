// Run from either the baseline or changed checkout. Captures mock data only.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = await import(pathToFileURL(resolve('node_modules/playwright/index.mjs')));
const { createServer } = await import(pathToFileURL(resolve('node_modules/vite/dist/node/index.js')));
const output = resolve(process.env.CAPTURE_DIR ?? 'test-results/visual/after');
await mkdir(output, { recursive: true });
process.env.VITE_DATA_MODE = 'mock';
const server = await createServer({ server: { host: '127.0.0.1', port: 5186, strictPort: true } });
await server.listen();
let browser;
try {
  browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {});
  const manifest = [];
  for (const [device, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844], ['compact', 320, 740]]) {
    const page = await browser.newPage({ viewport: { width, height }, isMobile: device !== 'desktop', hasTouch: device !== 'desktop' });
    for (const theme of ['light', 'dark']) {
      await page.goto('http://127.0.0.1:5186/settings');
      await page.locator(`input[name="theme"][value="${theme}"]`).check();
      for (const route of ['', 'rooms', 'settings']) {
        await page.goto(`http://127.0.0.1:5186/${route}`);
        await page.locator('h1').waitFor();
        await page.locator('.topbar__location strong').filter({ hasText: 'Family home' }).waitFor({ state: 'attached' });
        await page.locator('.room-card, .theme-options, .signature-hero').first().waitFor();
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(async () => { await Promise.all([...document.images].map(img => img.decode().catch(() => {}))); });
        const name = `${device}-${theme}-${route || 'home'}.png`;
        await page.screenshot({ path: resolve(output, name), fullPage: true });
        manifest.push({ name, width, height, theme, route: route || '/', data: 'mock simulation' });
      }
    }
    await page.close();
  }
  await writeFile(resolve(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
} finally { await browser?.close(); await server.close(); }
