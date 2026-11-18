import { test, expect } from '@playwright/test';
// Actual authenticated Core HTTP + TLS MQTT, no route interception.
test('LIVE numeric crossing, hysteresis, duplicate immunity and editable roundtrip', async ({ page }) => {
  const control = async (action: string, body = {}) => {
    const response = await fetch(`${process.env.RELAY_CONTROL_URL}/${action}`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.RELAY_CONTROL_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    expect(response.status).toBe(200); return response.json();
  };
  const count = async () => (await control('evidence')).received.length as number;
  const card = (name: string) => page.getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) });
  await page.goto('/');
  await page.getByLabel('Электронная почта', { exact: true }).fill('owner@example.test');
  await page.getByLabel('Пароль', { exact: true }).fill(process.env.RELAY_OWNER_PASSWORD!);
  await page.getByLabel('Пароль', { exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Fixture', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Правила', exact: true }).click();
  for (const numeric of [false, true]) {
    const name = numeric ? 'Свет при наступлении темноты' : 'Проверка обычного правила';
    await page.getByRole('button', { name: 'Создать правило', exact: true }).click();
    await page.getByLabel('Название правила', { exact: true }).fill(name);
    await page.getByRole('combobox', { name: 'Событие: устройство', exact: true }).selectOption('fixture_relay');
    if (numeric) {
      await page.getByRole('combobox', { name: 'Событие: показатель', exact: true }).selectOption('illuminance');
      await page.getByRole('combobox', { name: 'Событие: сравнение', exact: true }).selectOption('lt');
      await page.getByLabel('Событие: значение · лк', { exact: true }).fill('100');
      await page.getByLabel('Гистерезис · лк', { exact: true }).fill('20');
      await page.getByRole('button', { name: 'Добавить условие', exact: true }).click();
      await page.getByRole('combobox', { name: 'Условие 1: устройство', exact: true }).selectOption('fixture_relay');
      await page.getByRole('combobox', { name: 'Условие 1: показатель', exact: true }).selectOption('temperature');
      await page.getByLabel('Условие 1: значение · °C', { exact: true }).fill('10');
    }
    await page.getByRole('combobox', { name: 'Действие 1: устройство', exact: true }).selectOption('fixture_relay');
    await page.getByRole('button', { name: 'Сохранить правило', exact: true }).click();
    await expect(card(name)).toContainText('Выключена');
    await card(name).getByRole('button', { name: 'Редактировать правило', exact: true }).click();
    await expect(page.getByLabel('Название правила')).toHaveValue(name);
    await page.getByRole('button', { name: 'Сохранить правило', exact: true }).click();
    await expect(page.getByLabel('Название правила')).toHaveCount(0);
    await expect(card(name)).toContainText('Выключена');
  }
  const rule = card('Свет при наступлении темноты');
  await rule.getByRole('button', { name: 'Включить правило', exact: true }).click();
  await rule.getByRole('button', { name: 'Подтвердить включение', exact: true }).click();
  await expect(rule).toContainText('Включена');
  await control('numeric', { field: 'temperature', value: 23 });
  await control('numeric', { field: 'illuminance', value: 90 });
  await page.waitForTimeout(750); expect(await count()).toBe(0); // initial low only establishes baseline
  await control('numeric', { field: 'illuminance', value: 120 });
  await page.waitForTimeout(300);
  await rule.getByRole('button', { name: 'Результаты запусков', exact: true }).click();
  await control('numeric', { field: 'illuminance', value: 99 });
  await expect(rule).toContainText('Выполнено: ACK и состояние подтверждены', { timeout: 20000 });
  expect(await count()).toBe(1);
  await control('repeat');
  await control('numeric', { field: 'illuminance', value: 105 });
  await control('numeric', { field: 'illuminance', value: 98 });
  await page.waitForTimeout(31000);
  await control('repeat');
  await control('numeric', { field: 'illuminance', value: 97 });
  await page.waitForTimeout(500); expect(await count()).toBe(1);
  await page.screenshot({ path: 'test-results/live-numeric-confirmed-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/live-numeric-confirmed-mobile.png', fullPage: true });
  await rule.getByRole('button', { name: 'Выключить правило', exact: true }).click();
  await expect(rule).toContainText('Выключена');
});
