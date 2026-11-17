import { expect, test } from '@playwright/test';

test('LIVE automation editor → dry-run → enable → MQTT event → confirmed/failed/unknown results', async ({ page }) => {
  async function control(action: string, body = {}) {
    const response = await fetch(`${process.env.RELAY_CONTROL_URL}/${action}`, { method: 'POST', headers: {
      Authorization: `Bearer ${process.env.RELAY_CONTROL_KEY}`, 'Content-Type': 'application/json',
    }, body: JSON.stringify(body) });
    expect(response.status).toBe(200); return response.json();
  }
  const count = async () => (await control('evidence')).received.length as number;
  const card = (name: string) => page.getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) });
  async function create(name: string, trigger = false, action = true) {
    await page.getByRole('button', { name: 'Создать правило', exact: true }).click();
    await page.getByLabel('Название правила', { exact: true }).fill(name);
    await page.getByLabel('Событие: устройство', { exact: true }).selectOption('fixture_relay');
    await page.getByLabel('Событие: питание', { exact: true }).selectOption(String(trigger));
    await page.getByLabel('Действие 1: устройство', { exact: true }).selectOption('fixture_relay');
    await page.getByLabel('Действие 1: питание', { exact: true }).selectOption(String(action));
    await page.getByRole('button', { name: 'Сохранить правило', exact: true }).click();
    await expect(card(name)).toContainText('Выключена');
  }
  async function enable(name: string) {
    await card(name).getByRole('button', { name: 'Включить правило', exact: true }).click();
    await expect(card(name)).toContainText('Это не пробный запуск');
    await card(name).getByRole('button', { name: 'Подтвердить включение', exact: true }).click();
    await expect(card(name)).toContainText('Включена');
  }
  async function disable(name: string) {
    await card(name).getByRole('button', { name: 'Выключить правило', exact: true }).click();
    await expect(card(name)).toContainText('Выключена');
  }
  async function setInitial() {
    await control('state', { on: true });
    await expect.poll(async () => (await control('device')).state.on).toBe(true);
  }
  await page.goto('/');
  await page.getByLabel('Электронная почта', { exact: true }).fill('owner@example.test');
  await page.getByLabel('Пароль', { exact: true }).fill(process.env.RELAY_OWNER_PASSWORD!);
  await page.getByLabel('Пароль', { exact: true }).press('Enter');
  // This isolated fixture has one accessible home, selected automatically.
  await expect(page.getByRole('heading', { name: 'Fixture', exact: true, level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Правила', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Автоматизации', exact: true })).toBeVisible();
  await setInitial();
  await create('Свет по событию');
  await card('Свет по событию').getByRole('button', { name: 'Проверить условия (без команд)', exact: true }).click();
  await expect(card('Свет по событию')).toContainText('Команды не отправлялись');
  expect(await count()).toBe(0);
  const rights = await control('rights', { name: 'Свет по событию' });
  expect([403, 404]).toContain(rights.foreign_history);
  expect([403, 404]).toContain(rights.foreign_dry_run);
  expect([403, 404]).toContain(rights.resident_dry_run);
  expect(await count()).toBe(0);
  await create('Защита от цепочки', true, false);
  await enable('Защита от цепочки');
  await enable('Свет по событию');
  await card('Свет по событию').getByRole('button', { name: 'Результаты запусков', exact: true }).click();
  await control('state', { on: false });
  const history = page.getByRole('region', { name: 'Запуски: Свет по событию', exact: true });
  await expect(history).toContainText('Выполнено: ACK и состояние подтверждены', { timeout: 20_000 });
  await expect(history).toContainText('Подтверждено: ACK и состояние');
  expect(await count()).toBe(1);
  await control('repeat');
  // Verify dedup is durable, not merely the 30-second admission cooldown.
  await page.waitForTimeout(31_000);
  await control('repeat');
  await page.waitForTimeout(500);
  expect(await count()).toBe(1);
  await disable('Свет по событию');
  await disable('Защита от цепочки');
  await setInitial(); await control('state', { on: false });
  await expect.poll(async () => (await control('device')).state.on).toBe(false);
  expect(await count()).toBe(1);
  for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const toggle = page.getByRole('button', { name: theme === 'dark' ? 'Включить тёмную тему' : 'Включить светлую тему', exact: true });
    if (await toggle.count()) await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.screenshot({ path: `test-results/live-automation-${width}-${theme}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [name, mode, outcome] of [
    ['Отказ программного реле', 'fail', 'Устройство отказало'],
    ['Потеря подтверждения', 'drop', 'Нет подтверждения в срок, исход неизвестен'],
  ] as const) {
    await setInitial(); await create(name); await control('mode', { mode }); await enable(name);
    await card(name).getByRole('button', { name: 'Результаты запусков', exact: true }).click();
    await control('state', { on: false });
    await expect(page.getByRole('region', { name: `Запуски: ${name}`, exact: true })).toContainText(outcome, { timeout: 45_000 });
    await disable(name);
  }
  expect(await count()).toBe(3);
  await page.reload();
  await expect(card('Потеря подтверждения')).toBeVisible();
  await card('Потеря подтверждения').getByRole('button', { name: 'Результаты запусков', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Запуски: Потеря подтверждения', exact: true })).toContainText('Нет подтверждения в срок, исход неизвестен');
  expect(await count()).toBe(3); // history/read/reload never replay commands
  await page.screenshot({ path: 'test-results/live-automation-terminal-outcomes.png', fullPage: true });
});
