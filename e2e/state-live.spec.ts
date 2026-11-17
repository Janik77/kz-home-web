import { writeFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { test } from './native-state-browser';

test('LIVE external MQTT state, visible-page bounded reads, reconnect and unsaved editor', async ({ page, context }) => {
  async function control(action: string, body = {}) {
    const response = await fetch(`${process.env.RELAY_CONTROL_URL}/${action}`, { method: 'POST', headers: {
      Authorization: `Bearer ${process.env.RELAY_CONTROL_KEY}`, 'Content-Type': 'application/json',
    }, body: JSON.stringify(body) });
    expect(response.status).toBe(200); return response.json();
  }
  let reads = 0, navigations = 0;
  const writes: string[] = [];
  page.on('request', request => {
    if (request.method() === 'GET' && /\/devices\?house_id=/.test(request.url())) reads++;
    if (request.method() !== 'GET' && /\/(commands|runs|automations)(\?|$)/.test(request.url())) writes.push(request.url());
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations++;
  });
  const state = page.locator('#device-fixture_relay .device-card__state');
  async function external(on: boolean) {
    await control('state', { on });
    await expect.poll(async () => (await control('device')).state.on).toBe(on);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://127.0.0.1:5176/');
  await page.bringToFront();
  await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('visible');
  await page.getByLabel('Электронная почта', { exact: true }).fill('owner@example.test');
  await page.getByLabel('Пароль', { exact: true }).fill(process.env.RELAY_OWNER_PASSWORD!);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Fixture', level: 1, exact: true })).toBeVisible();
  const initialNavigations = navigations;
  await external(true);
  await expect(state).toHaveText('Включено', { timeout: 10000 });
  await external(false);
  await expect(state).toHaveText('Выключено', { timeout: 10000 });
  await page.screenshot({ path: 'test-results/live-state-home.png', fullPage: true });
  const startReads = reads;
  await page.waitForTimeout(11_000);
  expect(reads - startReads).toBeGreaterThanOrEqual(2);
  expect(reads - startReads).toBeLessThanOrEqual(3);

  await page.getByRole('link', { name: 'Устройства', exact: true }).first().click();
  await page.locator('#device-fixture_relay').getByRole('link', { name: 'Подробнее', exact: true }).click();
  await expect(page).toHaveURL(/\/devices\/fixture_relay$/);
  await external(true);
  await expect(state).toHaveText('Включено', { timeout: 10000 });
  await page.screenshot({ path: 'test-results/live-state-device.png', fullPage: true });

  // A real second browser tab in headed Chrome/Xvfb, not an injected visibility property.
  const other = await context.newPage();
  await other.goto('about:blank'); await other.bringToFront();
  await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('hidden');
  await page.waitForTimeout(1000); const hiddenReads = reads;
  await external(false); await page.waitForTimeout(11_000);
  expect(reads).toBe(hiddenReads);
  await page.bringToFront();
  await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('visible');
  await expect(state).toHaveText('Выключено', { timeout: 10000 });
  await other.close();

  await context.setOffline(true);
  await page.waitForTimeout(1000); const offlineReads = reads;
  await external(true); await page.waitForTimeout(11_000);
  expect(reads).toBe(offlineReads);
  await expect(state).toHaveText('Выключено');
  await context.setOffline(false);
  await expect(state).toHaveText('Включено', { timeout: 10000 });

  // Real unsaved automation editor; leaving state pages must stop the Home timer.
  await page.getByRole('link', { name: 'Правила', exact: true }).first().click();
  await page.getByRole('button', { name: 'Создать правило', exact: true }).click();
  const name = page.getByLabel('Название правила', { exact: true });
  await name.fill('Несохранённый черновик после восстановления');
  const action = page.getByRole('combobox', { name: 'Действие 1: питание', exact: true });
  await action.selectOption('false');
  await page.waitForTimeout(1000); const editorReads = reads;
  await external(false); await context.setOffline(true); await page.waitForTimeout(6000);
  await context.setOffline(false); await page.waitForTimeout(6000);
  await expect(name).toHaveValue('Несохранённый черновик после восстановления');
  await expect(action).toHaveValue('false');
  expect(reads).toBe(editorReads);
  expect(navigations).toBe(initialNavigations);
  expect(writes).toEqual([]);
  expect((await control('definitions')).rules).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Несохранённый черновик после восстановления' })]));
  const proof = await control('evidence');
  expect(proof.received).toHaveLength(0); expect(proof.commands).toHaveLength(0);
  await page.screenshot({ path: 'test-results/live-state-draft.png', fullPage: true });
  const metrics = JSON.stringify({ reads, hiddenReads, offlineReads, editorReads, navigations, writes, core_sha: proof.core_sha, web_sha: proof.web_sha });
  await writeFile(test.info().outputPath('bounded-read-evidence.json'), metrics);
  await test.info().attach('bounded-read-evidence', { body: metrics, contentType: 'application/json' });
});
