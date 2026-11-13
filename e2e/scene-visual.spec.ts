import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test('LIVE scene composition at 390, 768 and 1440 in both themes, read-only', async ({ page }) => {
  const response = await fetch(`${process.env.RELAY_CONTROL_URL}/scene-visual-run`, { method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RELAY_CONTROL_KEY}`, 'Content-Type': 'application/json' }, body: '{}' });
  expect(response.status).toBe(200); const { id } = await response.json();
  await page.goto('/'); await page.getByLabel('Электронная почта', { exact: true }).fill('owner@example.test');
  await page.getByLabel('Пароль', { exact: true }).fill(process.env.RELAY_OWNER_PASSWORD!); await page.getByLabel('Пароль', { exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Fixture', exact: true }).click();
  await page.getByRole('link', { name: 'Сценарии', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Проверка успеха', exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const writes: string[] = []; page.on('request', r => { if (r.method() !== 'GET' && r.url().includes('/core-api/')) writes.push(r.url()); });
  const metrics: unknown[] = [];
  for (const state of ['list', 'result']) {
    if (state === 'result') {
      const article = page.getByRole('article', { name: 'Проверка неизвестного результата', exact: true });
      await article.getByText('Запуск и результат', { exact: true }).click();
      await article.getByText('Открыть сохранённый запуск по ID', { exact: true }).click();
      await article.getByLabel('ID запуска', { exact: true }).fill(id);
      await article.getByRole('button', { name: 'Открыть результат', exact: true }).click();
      await expect(article).toContainText('Срок ожидания истёк, результат неизвестен');
    }
    for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      const toggle = page.getByRole('button', { name: theme === 'dark' ? 'Включить тёмную тему' : 'Включить светлую тему', exact: true });
      if (await toggle.count()) await toggle.click();
      await page.evaluate(() => window.scrollTo(0, 0));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const prefix = process.env.SCENE_SCREENSHOT_PREFIX ?? 'after';
      await page.screenshot({ path: `test-results/live-software-${prefix}-scenes-${state}-${width}-${theme}.png`, fullPage: true });
      metrics.push({ state, width, theme, height: await page.evaluate(() => document.documentElement.scrollHeight) });
    }
  }
  expect(writes).toEqual([]);
  await writeFile(`test-results/scene-visual-${process.env.SCENE_SCREENSHOT_PREFIX ?? 'after'}.json`, JSON.stringify(metrics, null, 2));
});
