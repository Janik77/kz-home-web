import { mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
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
    await page.getByLabel('Электронная почта', { exact: true }).fill(`${role}@example.test`);
    await page.getByLabel('Пароль', { exact: true }).fill(process.env.RELAY_OWNER_PASSWORD!);
    const response = page.waitForResponse(r => r.url().endsWith('/auth/login'));
    await page.getByLabel('Пароль', { exact: true }).press('Enter');
    const result = await response; expect(result.status()).toBe(200);
    if (['resident', 'installer', 'technician'].includes(role)) await page.getByRole('link', { name: 'Устройства', exact: true }).click();
    return (await result.json()).access_token as string;
  }
  async function logout() {
    await page.getByRole('link', { name: 'Аккаунт и дома' }).click();
    await page.getByRole('button', { name: 'Выйти', exact: true }).click();
    await expect(page.getByLabel('Электронная почта', { exact: true })).toBeVisible();
  }
  const owner = await login('owner');
  const card = page.getByRole('article', { name: 'Software relay · Room' });
  const state = card.locator('.device-card__state');
  const status = card.getByRole('status');
  const on = card.getByRole('button', { name: 'Включить', exact: true });
  const off = card.getByRole('button', { name: 'Выключить', exact: true });
  await expect(on).toBeEnabled(); await expect(state).toHaveText('Выключено');
  async function intent(value: boolean) {
    const response = page.waitForResponse(r => r.url().endsWith('/v1/devices/fixture_relay/commands') && r.request().method() === 'POST');
    await (value ? on : off).click();
    const result = await response; expect(result.status()).toBe(202);
    const receipt = await result.json();
    expect(receipt.command_id).toMatch(/^[a-f0-9-]{36}$/); expect(receipt.correlation_id).toMatch(/^[a-f0-9-]{36}$/);
    expect(receipt.house_id).toBe('fixture_house'); expect(receipt.requested_on).toBe(value);
    receipts.push(receipt); return receipt;
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await mkdir('test-results/software-control-frames', { recursive: true });
  let recording = true, frame = 0;
  // Start AFTER sign-in. Only actual screen frames of software-device control, no credentials.
  const capture = (async () => { while (recording) {
    await page.screenshot({ path: `test-results/software-control-frames/${String(frame++).padStart(5, '0')}.png` });
    await new Promise(resolve => setTimeout(resolve, 200));
  } })();
  await new Promise(resolve => setTimeout(resolve, 800));
  await control('mode', { mode: 'hold' });
  await intent(true);
  await expect(status).toHaveText('Ожидаем подтверждение'); await expect(state).toHaveText('Выключено');
  await expect(card.getByRole('button', { name: 'Команда выполняется' })).toBeDisabled();
  await card.getByRole('button', { name: 'Команда выполняется' }).evaluate(element => { (element as HTMLButtonElement).click(); (element as HTMLButtonElement).click(); });
  await expect.poll(() => gets.length).toBeGreaterThan(1);
  expect(posts).toHaveLength(1);
  await new Promise(resolve => setTimeout(resolve, 2000));
  await control('release');
  await expect(status).toHaveText('Выполнено · состояние обновлено'); await expect(state).toHaveText('Включено');
  await new Promise(resolve => setTimeout(resolve, 1200)); recording = false; await capture;
  execFileSync('ffmpeg', ['-y', '-framerate', '4', '-i', 'test-results/software-control-frames/%05d.png', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuv420p', 'test-results/live-software-home-control.webm'], { stdio: 'pipe' });
  await page.getByRole('link', { name: /Room.*Устройств/ }).click();
  await page.screenshot({ path: 'test-results/live-software-room-composition.png', fullPage: true });
  await page.goto('/devices');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await control('mode', { mode: 'apply' });
  await intent(false); await expect(status).toHaveText('Выполнено · данные Core обновлены'); await expect(state).toHaveText('Выключено');
  await intent(false); await expect(status).toHaveText('Выполнено · данные Core обновлены'); await expect(state).toHaveText('Выключено');
  await page.screenshot({ path: 'test-results/live-software-desktop.png', fullPage: true });
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
  await expect(page.getByRole('heading', { name: 'Нет доступных домов' })).toBeVisible();
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
  expect(evidence.database.migration).toBe(process.env.CORE_MIGRATION);
  expect(evidence.database.commands.map((r: { command_id: string }) => r.command_id).sort()).toEqual(receipts.map(r => r.command_id).sort());
  for (const command of evidence.database.commands.filter((row: { status: string }) => row.status === 'applied')) {
    expect(evidence.published.some((item: { topic: string; payload: { command_id: string; correlation_id: string; status: string }; qos: number; retain: boolean }) =>
      item.topic.endsWith('/ack') && item.payload.command_id === command.command_id && item.payload.correlation_id === command.correlation_id && item.payload.status === 'applied' && item.qos === 1 && !item.retain)).toBe(true);
    expect(evidence.published.some((item: { topic: string; payload: { correlation_id: string; state: { on: boolean } } }) =>
      item.topic.endsWith('/state') && item.payload.correlation_id === command.correlation_id && item.payload.state.on === command.requested_on)).toBe(true);
  }
  console.log('PASS offline 409, foreign 404, anonymous 401, independent SQL results and exact MQTT IDs');
});

test('LIVE delayed Core responses across houses, logout and inactive session', async ({ page }) => {
  async function control(action: string, body: unknown = {}) {
    const response = await fetch(`${process.env.RELAY_CONTROL_URL}/${action}`, { method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RELAY_CONTROL_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    expect(response.status).toBe(200); return response.json();
  }
  async function login() {
    await page.goto('/');
    await page.getByLabel('Электронная почта', { exact: true }).fill('owner@example.test');
    await page.getByLabel('Пароль', { exact: true }).fill(process.env.RELAY_OWNER_PASSWORD!);
    await page.getByLabel('Пароль', { exact: true }).press('Enter');
    await page.getByRole('button', { name: 'Fixture', exact: true }).click();
    await page.goto('/devices');
    await expect(page.getByRole('button', { name: 'Включить', exact: true })).toBeEnabled();
  }
  async function selectHouse(id: string) {
    await page.getByRole('link', { name: 'Аккаунт и дома' }).click();
    await page.getByRole('combobox', { name: 'Дом', exact: true }).selectOption(id);
  }
  const card = page.getByRole('article', { name: 'Software relay · Room' });
  const posts: string[] = [];
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/commands')) posts.push(request.url()); });
  await control('second-house'); await control('mode', { mode: 'apply' }); await login();
  for (const stage of ['permissions', 'post', 'poll', 'refresh']) {
    await control('mode', { mode: stage === 'poll' ? 'hold' : 'apply' });
    const path = stage === 'permissions' ? '/v1/houses/fixture_house/me/permissions'
      : stage === 'post' ? '/v1/devices/fixture_relay/commands'
      : stage === 'poll' ? '/v1/houses/fixture_house/commands/' : '/devices?house_id=fixture_house';
    const before = posts.length;
    await control('delay-http', { path, method: stage === 'post' ? 'POST' : 'GET', skip: stage === 'refresh' ? 1 : 0 });
    await card.getByRole('button', { name: 'Выключить', exact: true }).click();
    await expect.poll(async () => (await control('delay-state')).seen).toBe(true);
    await selectHouse('race_house');
    await expect(page.getByText('Устройств пока нет.', { exact: true })).toBeVisible();
    await control('release-http'); await control('release');
    await expect(card).toHaveCount(0); await expect(page.getByText(/Выполнено|команда отменена/i)).toHaveCount(0);
    expect(posts.length - before).toBe(stage === 'permissions' ? 0 : 1);
    await selectHouse('fixture_house');
    await page.goto('/devices');
    await expect(card.getByRole('button', { name: 'Включить', exact: true })).toBeEnabled();
  }
  console.log('PASS LIVE real delayed permission, POST, poll and state responses isolated across houses');
  await control('mode', { mode: 'apply' });
  await control('delay-http', { path: '/v1/devices/fixture_relay/commands', method: 'POST' });
  await card.getByRole('button', { name: 'Выключить', exact: true }).click();
  await expect.poll(async () => (await control('delay-state')).seen).toBe(true);
  await page.getByRole('link', { name: 'Аккаунт и дома' }).click();
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page.getByLabel('Электронная почта', { exact: true })).toBeVisible();
  await control('release-http');
  await expect(card).toHaveCount(0);
  await login();
  await control('delay-http', { path: '/v1/houses/fixture_house/me/permissions' });
  const before = posts.length;
  await card.getByRole('button', { name: 'Включить', exact: true }).click();
  await expect.poll(async () => (await control('delay-state')).seen).toBe(true);
  await control('deactivate-owner');
  await page.getByRole('button', { name: 'Обновить данные' }).click();
  await expect(page.getByLabel('Электронная почта', { exact: true })).toBeVisible();
  await control('release-http'); await control('activate-owner');
  expect(posts).toHaveLength(before);
  await expect(page.getByText(/Выполнено|команда отменена/i)).toHaveCount(0);
  const evidence = await control('evidence');
  expect(evidence.database.counts).toEqual(['applied|14', 'failed|1', 'timed_out|1']);
  expect(evidence.database.invalid_applied).toBe('0');
  console.log('PASS LIVE logout after POST reached Core, inactive-session invalidation during permissions, SQL applied14/failed1/timed_out1');
});


test('LIVE mobile software relay ON/OFF with persisted MQTT receipts', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('Электронная почта', { exact: true }).fill('owner@example.test');
  await page.getByLabel('Пароль', { exact: true }).fill(process.env.RELAY_OWNER_PASSWORD!);
  await page.getByLabel('Пароль', { exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Fixture', exact: true }).click();
  const card = page.getByRole('article', { name: 'Software relay · Room' });
  for (const value of [true, false]) {
    const response = page.waitForResponse(r => r.url().endsWith('/v1/devices/fixture_relay/commands') && r.request().method() === 'POST');
    await card.getByRole('button', { name: value ? 'Включить' : 'Выключить', exact: true }).click();
    expect((await response).status()).toBe(202);
    await expect(card.getByRole('status')).toHaveText('Выполнено · состояние обновлено');
    await expect(card.locator('.device-card__state')).toHaveText(value ? 'Включено' : 'Выключено');
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/live-software-mobile.png', fullPage: true });
  console.log('PASS LIVE mobile 390px ON/OFF through Core and MQTT');
});


test('LIVE create scene and rename definitions without running devices', async ({ page }) => {
  async function control(action: string) {
    const response = await fetch(`${process.env.RELAY_CONTROL_URL}/${action}`, { method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RELAY_CONTROL_KEY}`, 'Content-Type': 'application/json' }, body: '{}' });
    expect(response.status).toBe(200); return response.json();
  }
  await control('seed-definition');
  const before = await control('definition-evidence');
  const dangerous: string[] = [];
  page.on('request', r => { if (r.method() !== 'GET' && /\/(run|enable|disable|commands)(\?|$)/.test(r.url())) dangerous.push(r.url()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('Электронная почта', { exact: true }).fill('owner@example.test');
  await page.getByLabel('Пароль', { exact: true }).fill(process.env.RELAY_OWNER_PASSWORD!);
  await page.getByLabel('Пароль', { exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Fixture', exact: true }).click();
  await page.getByRole('link', { name: 'Сценарии', exact: true }).click();
  await page.getByRole('button', { name: 'Создать сценарий' }).click();
  await page.getByLabel('Название сценария', { exact: true }).fill('Вечер дома');
  await page.getByLabel('Устройство 1', { exact: true }).selectOption('fixture_relay');
  await page.getByLabel('Питание 1', { exact: true }).selectOption('true');
  await page.screenshot({ path: 'test-results/live-software-scene-form-mobile.png', fullPage: true });
  await page.getByRole('link', { name: 'Комнаты', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Остаться', exact: true }).click();
  await expect(page.getByLabel('Название сценария', { exact: true })).toHaveValue('Вечер дома');
  await page.getByRole('button', { name: 'Сохранить сценарий' }).click();
  const scene = page.getByRole('article', { name: 'Вечер дома', exact: true });
  await expect(scene).toBeVisible();
  await scene.getByRole('button', { name: 'Изменить название' }).click();
  await scene.getByLabel('Новое название').fill('Вечер с семьёй');
  await scene.getByRole('button', { name: 'Сохранить название' }).click();
  await expect(page.getByRole('article', { name: 'Вечер с семьёй', exact: true })).toBeVisible();
  await page.locator('.mobile-more summary').click();
  await page.getByRole('link', { name: 'Правила', exact: true }).click();
  await page.getByRole('button', { name: 'Изменить название' }).click();
  await page.getByLabel('Новое название').fill('Название без изменения логики');
  await page.getByRole('button', { name: 'Сохранить название' }).click();
  await expect(page.getByRole('heading', { name: 'Название без изменения логики' })).toBeVisible();
  await page.screenshot({ path: 'test-results/live-software-rule-mobile.png', fullPage: true });
  const after = await control('definition-evidence');
  expect(after.scenes).toHaveLength(1);
  expect(after.scenes[0]).toMatchObject({ name: 'Вечер с семьёй', house_id: 'fixture_house',
    actions: [{ type: 'device_state', device_id: 'fixture_relay', state: { on: true } }] });
  expect(after.rules).toHaveLength(1);
  expect(after.rules[0]).toMatchObject({ name: 'Название без изменения логики', enabled: false,
    trigger: before.rules[0].trigger, conditions: before.rules[0].conditions, actions: before.rules[0].actions });
  expect(after.mqtt_commands).toBe(before.mqtt_commands); expect(after.mqtt_commands).toBe(18);
  expect(dangerous).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  console.log('PASS LIVE definitions: persisted scene and renamed rule, untouched actions/trigger/enabled, zero extra MQTT commands');
});

test('LIVE independent editors, atomic 409 and legacy ABA preserve drafts without MQTT', async ({ browser }) => {
  async function control(action: string, data = {}) {
    const response = await fetch(`${process.env.RELAY_CONTROL_URL}/${action}`, { method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RELAY_CONTROL_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    expect(response.status).toBe(200); return response.json();
  }
  const baseline = await control('definition-evidence');
  for (const kind of ['scenes', 'automations'] as const) {
    const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
    try {
      const pages = await Promise.all(contexts.map(context => context.newPage()));
      await Promise.all(pages.map(async page => {
        await page.goto('/');
        await page.getByLabel('Электронная почта', { exact: true }).fill('owner@example.test');
        await page.getByLabel('Пароль', { exact: true }).fill(process.env.RELAY_OWNER_PASSWORD!);
        await page.getByLabel('Пароль', { exact: true }).press('Enter');
        await page.getByRole('button', { name: 'Fixture', exact: true }).click();
        await page.getByRole('link', { name: kind === 'scenes' ? 'Сценарии' : 'Правила', exact: true }).click();
        await page.getByRole('button', { name: 'Изменить название' }).click();
      }));
      let arrived = 0; let release!: () => void;
      const bothReady = new Promise<void>(resolve => { release = resolve; });
      const attempts: { expected_revision: number; name: string }[] = [];
      const statuses: number[] = [];
      // Delay only outbound requests until both real preflight GETs have finished.
      // Responses and the PostgreSQL CAS decision come entirely from real Core.
      await Promise.all(pages.map(page => page.route(`**/core-api/${kind}/*`, async route => {
        if (route.request().method() === 'PATCH') {
          attempts.push(route.request().postDataJSON()); if (++arrived === 2) release();
          await bothReady;
        }
        await route.continue();
      })));
      pages.forEach(page => page.on('response', r => {
        if (r.request().method() === 'PATCH' && r.url().includes(`/core-api/${kind}/`)) statuses.push(r.status());
      }));
      await Promise.all(pages.map(async (page, i) => {
        await page.getByLabel('Новое название').fill(`Concurrent ${kind} ${i}`);
        await page.getByRole('button', { name: 'Сохранить название' }).click();
      }));
      await expect.poll(() => statuses.length).toBe(2);
      expect([...statuses].sort()).toEqual([200, 409]);
      expect(attempts).toHaveLength(2); expect(attempts[0]!.expected_revision).toBe(attempts[1]!.expected_revision);
      await expect.poll(async () => (await pages[0]!.getByLabel('Новое название').count()) + (await pages[1]!.getByLabel('Новое название').count())).toBe(1);
      const failed = (await pages[0]!.getByLabel('Новое название').count()) ? 0 : 1;
      const loser = pages[failed]!;
      await expect(loser.getByRole('alert')).toContainText('Черновик и его исходная версия сохранены');
      await expect(loser.getByLabel('Новое название')).toHaveValue(`Concurrent ${kind} ${failed}`);
      if (kind === 'automations') await loser.setViewportSize({ width: 390, height: 844 });
      await loser.getByRole('link', { name: 'Комнаты', exact: true }).click();
      const leaveDialog = loser.getByRole('dialog', { name: 'Есть несохранённые изменения' });
      await expect(leaveDialog).toBeVisible();
      await loser.screenshot({ path: `test-results/live-software-${kind}-draft-guard.png` });
      await leaveDialog.getByRole('button', { name: 'Остаться', exact: true }).click();
      await expect(loser.getByLabel('Новое название')).toHaveValue(`Concurrent ${kind} ${failed}`);
      expect(attempts).toHaveLength(2);
      await loser.getByRole('button', { name: 'Обновить список без сброса черновика' }).click();
      await expect(loser.getByRole('button', { name: 'Я сравнил изменения — использовать текущую версию' })).toBeVisible();
      await expect(loser.getByLabel('Новое название')).toHaveValue(`Concurrent ${kind} ${failed}`);
      expect(attempts).toHaveLength(2); // refresh must never submit or replace the captured revision
      if (kind === 'automations') await loser.setViewportSize({ width: 390, height: 844 });
      await loser.screenshot({ path: `test-results/live-software-${kind}-revision-conflict.png`, fullPage: true });
      await loser.getByRole('button', { name: 'Я сравнил изменения — использовать текущую версию' }).click();
      await loser.getByRole('button', { name: 'Сохранить название' }).click();
      await expect(loser.getByLabel('Новое название')).toHaveCount(0);
      expect(attempts).toHaveLength(3); expect(attempts[2]!.expected_revision).toBe(attempts[0]!.expected_revision + 1);
      await loser.getByRole('button', { name: 'Изменить название' }).click();
      await loser.getByLabel('Новое название').fill('Draft survives legacy ABA');
      const aba = await control('legacy-definition-aba', { kind });
      expect(aba.stale_status).toBe(409);
      await loser.getByRole('button', { name: 'Сохранить название' }).click();
      await expect(loser.getByRole('alert')).toContainText('Черновик и его исходная версия сохранены');
      await expect(loser.getByLabel('Новое название')).toHaveValue('Draft survives legacy ABA');
      expect(attempts).toHaveLength(3); // ABA detected by revision even though name is unchanged
    } finally { await Promise.all(contexts.map(context => context.close())); }
  }
  const after = await control('definition-evidence');
  expect(after.mqtt_commands).toBe(baseline.mqtt_commands); expect(after.mqtt_commands).toBe(18);
  expect(after.scenes[0].actions).toEqual(baseline.scenes[0].actions);
  for (const field of ['trigger', 'conditions', 'actions', 'enabled']) expect(after.rules[0][field]).toEqual(baseline.rules[0][field]);
  console.log('PASS LIVE revisions: two independent browser clients per kind; actual PostgreSQL/Core 200+409; explicit reconciliation; legacy ABA rejected; zero extra MQTT');
});
