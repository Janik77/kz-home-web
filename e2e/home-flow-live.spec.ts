import { test, expect } from '@playwright/test';

test('LIVE room → delayed light → favorite → F5 → scene → journal, without duplicate sends', async ({ page }, info) => {
  async function control(action: string, data = {}) {
    const r = await fetch(`${process.env.RELAY_CONTROL_URL}/${action}`, { method: 'POST', headers: {
      Authorization: `Bearer ${process.env.RELAY_CONTROL_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    expect(r.status).toBe(200); return r.json();
  }
  async function login() {
    await page.getByLabel('Электронная почта', { exact: true }).fill('owner@example.test');
    await page.getByLabel('Пароль', { exact: true }).fill(process.env.RELAY_OWNER_PASSWORD!);
    await page.getByLabel('Пароль', { exact: true }).press('Enter');
  }
  async function nav(name: string) {
    const link = page.getByRole('link', { name, exact: true });
    if (!(await link.isVisible()) && await page.locator('.mobile-more summary').isVisible()) await page.locator('.mobile-more summary').click();
    await link.click();
  }
  await control('online'); await control('state', { on: false }); await control('hold');
  const before = (await control('evidence')).received.length;
  const sends: string[] = [];
  page.on('request', r => { if (r.method() === 'POST' && /\/commands$|\/scene-runs\/execute$/.test(new URL(r.url()).pathname)) sends.push(r.url()); });
  await page.goto('/'); await login(); await expect(page.getByRole('heading', { name: 'Fixture', exact: true })).toBeVisible();
  await nav('Комнаты'); await page.locator('a[href="/rooms/fixture_room"]').first().click();
  await expect(page).toHaveURL(/\/rooms\/fixture_room$/);
  const on = page.getByRole('button', { name: 'Включить', exact: true });
  await expect(on).toBeEnabled();
  await on.evaluate(b => { (b as HTMLButtonElement).click(); (b as HTMLButtonElement).click(); });
  await expect(page.getByText(/Ожидаем подтверждение/)).toBeVisible();
  await expect.poll(async () => (await control('evidence')).received.length).toBe(before + 1);
  await page.waitForTimeout(1200); expect(sends).toHaveLength(1);
  await control('release');
  await expect(page.getByText('Выполнено · состояние обновлено', { exact: true })).toBeVisible();
  const add = page.getByRole('button', { name: 'Добавить в избранное: Software relay', exact: true });
  if (await add.count()) await add.click();
  await expect(page.getByRole('button', { name: 'Убрать из избранного: Software relay', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.reload(); await expect(page.getByRole('heading', { name: 'Вход в дом' })).toBeVisible();
  await expect(page.getByText(/Адрес открытого экрана сохраняется/)).toBeVisible();
  expect(sends).toHaveLength(1); await login(); await expect(page).toHaveURL(/\/rooms\/fixture_room$/);
  await expect(page.getByRole('button', { name: 'Убрать из избранного: Software relay', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await control('offline'); await expect(page.getByText('Устройство не в сети', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Выключить', exact: true })).toBeDisabled(); expect(sends).toHaveLength(1);
  await control('online'); await control('refresh'); await expect(page.getByRole('button', { name: 'Выключить', exact: true })).toBeEnabled({ timeout: 15000 });
  await nav('Сценарии'); await page.getByRole('button', { name: 'Создать сценарий', exact: true }).click();
  const name = info.project.name === 'mobile' ? 'Ушёл из дома' : 'Ушёл из дома · компьютер';
  await page.getByLabel('Название сценария', { exact: true }).fill(name);
  await page.getByLabel('Устройство 1', { exact: true }).selectOption('fixture_relay');
  await page.getByLabel('Питание 1', { exact: true }).selectOption('false');
  await page.getByRole('button', { name: 'Сохранить сценарий', exact: true }).click();
  const scene = page.getByRole('article', { name, exact: true }); await expect(scene).toBeVisible(); expect(sends).toHaveLength(1);
  await scene.getByText('Запуск и результат', { exact: true }).click();
  const run = scene.getByRole('button', { name: 'Запустить сценарий', exact: true }); await expect(run).toBeEnabled();
  await run.evaluate(b => { (b as HTMLButtonElement).click(); (b as HTMLButtonElement).click(); });
  await expect(scene).toContainText('Все действия подтверждены', { timeout: 20000 }); expect(sends).toHaveLength(2);
  const proof = await control('evidence'); expect(proof.received).toHaveLength(before + 2);
  expect(proof.commands.slice(-2)).toEqual(expect.arrayContaining([expect.objectContaining({ status: 'applied', requested_on: true, reported_on: true }), expect.objectContaining({ status: 'applied', requested_on: false, reported_on: false })]));
  await page.screenshot({ path: `test-results/home-flow-${info.project.name}-scene.png`, fullPage: true });
  await nav('Журнал'); await expect(page.getByRole('heading', { name: 'Журнал событий' })).toBeVisible();
  await expect(page.getByText('Состояние устройства изменилось', { exact: true }).first()).toBeVisible();
  await expect(page.locator('.event-list')).toContainText('Software relay');
  await page.screenshot({ path: `test-results/home-flow-${info.project.name}-journal.png`, fullPage: true });
  expect(sends).toHaveLength(2); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (info.project.name === 'mobile') {
    await nav('Комнаты'); await page.locator('a[href="/rooms/fixture_room"]').first().click();
    await expect(page.getByRole('button', { name: 'Включить', exact: true })).toBeEnabled();
    await control('clock-fault');
    await page.getByRole('button', { name: 'Включить', exact: true }).click();
    await expect(page.getByText(/Core временно остановил управление: часы сервера нестабильны/)).toBeVisible();
    expect((await control('evidence')).received).toHaveLength(before + 2);
    expect((await control('evidence')).commands).toHaveLength(before + 2);
    await page.screenshot({ path: 'test-results/home-flow-mobile-clock-guard.png', fullPage: true });
  }

});
