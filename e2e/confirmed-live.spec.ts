import { expect, test } from '@playwright/test';

// Real browser traffic only. The control endpoint drives an owned software relay,
// never intercepts Web traffic or modifies Core behavior.
test('LIVE confirmed relay lifecycle with PostgreSQL and MQTT TLS', async ({ page }) => {
  const receipts: { command_id: string; correlation_id: string; requested_on: boolean }[] = [];
  const posts: string[] = [];
  const gets: string[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.includes('/v1/') && request.method() === 'POST') posts.push(request.headers()['idempotency-key']!);
    if (path.includes('/v1/') && request.method() === 'GET') gets.push(path);
  });
  async function control(action: string, body: unknown = {}) {
    const response = await fetch(`${process.env.RELAY_CONTROL_URL}/${action}`, {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.RELAY_CONTROL_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    expect(response.status).toBe(200); return response.json();
  }
  async function login(role: string) {
    await page.goto('/');
    await page.getByLabel('Email', { exact: true }).fill(`${role}@example.test`);
    await page.getByLabel('Password', { exact: true }).fill(process.env.RELAY_OWNER_PASSWORD!);
    const response = page.waitForResponse(r => r.url().endsWith('/auth/login'));
    await page.getByLabel('Password', { exact: true }).press('Enter');
    const result = await response; expect(result.status()).toBe(200);
    return (await result.json()).access_token as string;
  }
  async function logout() {
    await page.getByRole('link', { name: 'Аккаунт и дома' }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  }
  const owner = await login('owner');
  const card = page.getByRole('article', { name: 'Physical relay · Room' });
  const state = card.locator('.signature-device__state');
  const status = card.getByRole('status');
  const on = card.getByRole('button', { name: 'Включить', exact: true });
  const off = card.getByRole('button', { name: 'Выключить', exact: true });
  await expect(off).toBeEnabled(); await expect(state).toHaveText('Выключено');
  async function intent(value: boolean) {
    const response = page.waitForResponse(r => r.url().endsWith('/v1/devices/fixture_relay/commands') && r.request().method() === 'POST');
    await (value ? on : off).click();
    const result = await response; expect(result.status()).toBe(202);
    const receipt = await result.json();
    expect(receipt.command_id).toMatch(/^[a-f0-9-]{36}$/); expect(receipt.correlation_id).toMatch(/^[a-f0-9-]{36}$/);
    expect(receipt.house_id).toBe('fixture_house'); expect(receipt.requested_on).toBe(value);
    receipts.push(receipt); return receipt;
  }
  await control('mode', { mode: 'hold' });
  await intent(true);
  await expect(status).toHaveText('Ожидаем подтверждение'); await expect(state).toHaveText('Выключено');
  await expect(on).toBeDisabled(); await expect(off).toBeDisabled();
  await on.evaluate(element => { (element as HTMLButtonElement).click(); (element as HTMLButtonElement).click(); });
  await expect.poll(() => gets.length).toBeGreaterThan(1);
  expect(posts).toHaveLength(1);
  await control('release');
  await expect(status).toHaveText('Выполнено · данные Core обновлены'); await expect(state).toHaveText('Включено');
  await control('mode', { mode: 'apply' });
  await intent(false); await expect(status).toHaveText('Выполнено · данные Core обновлены'); await expect(state).toHaveText('Выключено');
  await intent(false); await expect(status).toHaveText('Выполнено · данные Core обновлены'); await expect(state).toHaveText('Выключено');
  console.log('PASS ON, OFF, unchanged OFF, pending, no optimistic update, duplicate clicks');

  await control('mode', { mode: 'fail' });
  await intent(true); await expect(status).toHaveText('Не удалось выполнить'); await expect(state).toHaveText('Выключено');
  await control('mode', { mode: 'drop' });
  await intent(true); await expect(status).toHaveText('Ожидаем подтверждение');
  await expect(status).toHaveText('Нет подтверждения — состояние неизвестно', { timeout: 40_000 });
  await expect(state).toHaveText('Выключено'); expect(posts).toHaveLength(5);
  console.log('PASS negative device ACK and real 30-second deadline without automatic resend');

  await control('offline'); await page.getByRole('button', { name: 'Обновить данные' }).click();
  await expect(state).toContainText('Не в сети'); await expect(on).toBeDisabled();
  async function browserCommand(token?: string) {
    return page.evaluate(async ({ token }) => {
      const response = await fetch('/core-api/v1/devices/fixture_relay/commands', { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ on: true }) });
      return response.status;
    }, { token });
  }
  expect(await browserCommand(owner)).toBe(409);
  await control('online'); await control('mode', { mode: 'apply' });
  await page.getByRole('button', { name: 'Обновить данные' }).click();
  await expect(off).toBeEnabled(); await intent(false); await expect(status).toHaveText('Выполнено · данные Core обновлены');
  await logout();
  for (const role of ['resident', 'installer', 'technician']) {
    await control('role', { role }); await login('resident');
    await expect(on).toBeEnabled();
    await intent(true); await expect(status).toHaveText('Выполнено · данные Core обновлены'); await expect(state).toHaveText('Включено');
    await intent(false); await expect(status).toHaveText('Выполнено · данные Core обновлены'); await expect(state).toHaveText('Выключено');
    if (role !== 'technician') await logout();
  }
  const beforeRevocation = posts.length;
  await control('revoke');
  await on.click();
  await expect(status).toHaveText('Устройство или команда недоступны');
  expect(posts).toHaveLength(beforeRevocation);
  console.log('PASS all four roles confirmed ON/OFF; revoked membership rechecked before POST');
  await logout(); const foreign = await login('foreign');
  await expect(page.getByRole('heading', { name: 'No accessible homes' })).toBeVisible();
  expect(await browserCommand(foreign)).toBe(404); expect(await browserCommand()).toBe(401);
  const denied = await page.evaluate(async ({ foreign, id }) => (await fetch(`/core-api/v1/houses/fixture_house/commands/${id}`, { headers: { Authorization: `Bearer ${foreign}` } })).status,
    { foreign, id: receipts[0]!.command_id });
  expect(denied).toBe(404);
  const evidence = await control('evidence');
  expect(evidence.received.map((r: { command_id: string }) => r.command_id)).toEqual(receipts.map(r => r.command_id));
  expect(evidence.received.map((r: { correlation_id: string }) => r.correlation_id)).toEqual(receipts.map(r => r.correlation_id));
  expect(new Set(posts).size).toBe(posts.length);
  expect(evidence.database.counts).toEqual(['applied|10', 'failed|1', 'timed_out|1']);
  expect(evidence.database.invalid_applied).toBe('0');
  expect(evidence.database.migration).toBe('0006_command_lifecycle');
  expect(evidence.database.commands.map((r: { command_id: string }) => r.command_id).sort()).toEqual(receipts.map(r => r.command_id).sort());
  console.log('PASS offline 409, foreign 404, anonymous 401, independent SQL results and exact MQTT IDs');
});
