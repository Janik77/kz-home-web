import { expect, test } from '@playwright/test';

test('LIVE one-click server scene execution, navigation independence, partial failure and unknown without replay', async ({ page }) => {
  async function control(action: string, data = {}) {
    const response = await fetch(`${process.env.RELAY_CONTROL_URL}/${action}`, { method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RELAY_CONTROL_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    expect(response.status).toBe(200); return response.json();
  }
  await control('seed-run-scenes'); await control('online'); await control('mode', { mode: 'hold' });
  await page.goto('/'); await page.getByLabel('Электронная почта', { exact: true }).fill('owner@example.test');
  await page.getByLabel('Пароль', { exact: true }).fill(process.env.RELAY_OWNER_PASSWORD!); await page.getByLabel('Пароль', { exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Fixture', exact: true }).click();
  await page.getByRole('link', { name: 'Сценарии', exact: true }).click();
  const posts: string[] = []; page.on('request', r => { if (r.method() === 'POST' && r.url().includes('/scene-runs')) posts.push(r.url()); });
  const article = (name: string) => page.getByRole('article', { name, exact: true });
  const region = (name: string) => page.getByRole('region', { name: `Подтверждённый запуск: ${name}` });
  await expect(article('Проверка успеха')).toBeVisible();
  await page.screenshot({ path: 'test-results/live-software-scene-list-desktop.png', fullPage: true });
  await article('Проверка успеха').getByText('Запуск и результат', { exact: true }).click();
  const success = region('Проверка успеха');
  await success.getByRole('button', { name: 'Запустить сценарий', exact: true }).evaluate(button => {
    (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click();
  });
  await expect(success).toContainText('Отправлено, ожидаем ACK и состояние');
  await expect(success).toContainText('Подтверждено: 0 из 2');
  expect(posts).toHaveLength(1);
  expect((await control('evidence')).received).toHaveLength(19);
  await expect(success.getByRole('button', { name: /Выполнить действие/ })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/live-software-scene-waiting-desktop.png', fullPage: true });
  // Leaving the page must not cancel server execution or require another click.
  await page.getByRole('link', { name: 'Комнаты', exact: true }).click();
  await expect(page).toHaveURL(/\/rooms$/);
  await control('mode', { mode: 'apply' }); await control('release');
  await expect.poll(async () => (await control('evidence')).received.length).toBe(20);
  await page.goBack();
  const shell = article('Проверка успеха').locator('.core-scene-shell');
  if (await shell.getAttribute('open') === null) await shell.getByText('Запуск и результат', { exact: true }).click();
  await expect(success).toContainText('Все действия подтверждены'); expect(posts).toHaveLength(1);
  await page.screenshot({ path: 'test-results/live-software-scene-success-desktop.png', fullPage: true });

  await article('Проверка частичного результата').getByText('Запуск и результат', { exact: true }).click();
  const partial = region('Проверка частичного результата');
  await control('mode-plan', { plan: ['apply', 'fail'] });
  await partial.getByRole('button', { name: 'Запустить сценарий', exact: true }).click();
  await expect(partial).toContainText('Выполнено частично. Подтверждено: 1 из 2');
  expect(posts).toHaveLength(2);
  await page.screenshot({ path: 'test-results/live-software-scene-partial-desktop.png', fullPage: true });

  await article('Проверка неизвестного результата').getByText('Запуск и результат', { exact: true }).click();
  const unknown = region('Проверка неизвестного результата');
  await control('mode', { mode: 'drop' });
  await unknown.getByRole('button', { name: 'Запустить сценарий', exact: true }).click();
  await expect(unknown).toContainText('Срок ожидания истёк, результат неизвестен', { timeout: 40_000 });
  expect(posts).toHaveLength(3);
  await unknown.getByRole('button', { name: 'Обновить результат', exact: true }).click();
  await expect(unknown.getByRole('button', { name: 'Обновить результат', exact: true })).toBeEnabled();
  expect(posts).toHaveLength(3); expect((await control('evidence')).received).toHaveLength(23);
  for (const width of [390, 1440]) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const toggle = page.getByRole('button', { name: theme === 'dark' ? 'Включить тёмную тему' : 'Включить светлую тему', exact: true });
    if (await toggle.count()) await toggle.click();
    await unknown.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/live-software-scene-unknown-${width}-${theme}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  // A changed definition refuses before dispatch. Refresh/review are observation only.
  await article('Проверка новой версии').getByText('Запуск и результат', { exact: true }).click();
  const changed = region('Проверка новой версии');
  await page.waitForLoadState('networkidle');
  const revision = await control('scene-revision-change');
  await changed.getByRole('button', { name: 'Запустить сценарий', exact: true }).click();
  await expect(changed.getByRole('alert')).toContainText('Конфликт версии');
  expect(posts).toHaveLength(4);
  await changed.getByRole('button', { name: 'Обновить сценарий для нового запуска', exact: true }).click();
  await expect(changed).toContainText(`Актуальная версия: ${revision.revision}`);
  await expect(changed.getByRole('button', { name: 'Запустить новый сценарий', exact: true })).toBeDisabled();
  await changed.getByRole('checkbox').check();
  await expect(changed.getByRole('button', { name: 'Запустить новый сценарий', exact: true })).toBeEnabled();
  expect(posts).toHaveLength(4); expect((await control('evidence')).received).toHaveLength(23);
  expect(posts.every(url => url.endsWith('/scene-runs/execute'))).toBe(true);
});
