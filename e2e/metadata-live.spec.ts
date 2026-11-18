import { test, expect } from '@playwright/test';
test('LIVE metadata rename, same-house move, conflict and zero relay commands', async ({ page }) => {
 const password = process.env.RELAY_OWNER_PASSWORD!;
 await page.goto('/'); await page.getByLabel('Электронная почта', { exact: true }).fill('owner@example.test'); await page.getByLabel('Пароль', { exact: true }).fill(password);
 const loginResponse = page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/auth/login'));
 await page.getByLabel('Пароль', { exact: true }).press('Enter'); const tokens = await (await loginResponse).json();
 const origin = new URL('/core-api', page.url()).href;
 const headers = { Authorization: `Bearer ${tokens.access_token}` };
 async function read(path: string) { const r = await page.request.get(origin + path, { headers }); expect(r.status()).toBe(200); return r.json(); }
 async function patch(path: string, body: unknown, status = 200) { const r = await page.request.patch(origin + path, { headers, data: body }); expect(r.status()).toBe(status); return r; }
 await expect(page.getByRole('heading', { name: 'Fixture', exact: true })).toBeVisible();
 for (const [path, data] of [['/floors', { id: 'metadata_floor', name: 'Верхний этаж', house_id: 'fixture_house', order: 1 }], ['/rooms', { id: 'metadata_room', name: 'Кабинет', floor_id: 'metadata_floor' }]] as const) { const r = await page.request.post(origin + path, { headers, data }); expect(r.status()).toBe(201); }
 await page.getByRole('link', { name: 'Настройки', exact: true }).click(); await page.getByRole('button', { name: 'Изменить название дома', exact: true }).click(); await page.getByLabel('Название', { exact: true }).fill('Наш дом'); await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click(); await expect(page.getByText('Изменения сохранены и прочитаны из Core.')).toBeVisible();
 expect((await read('/houses/fixture_house')).name).toBe('Наш дом'); await expect(page.getByRole('option', { name: 'Наш дом', exact: true })).toHaveCount(1);
 await page.screenshot({ path: 'test-results/live-metadata-house.png', fullPage: true });
 await page.getByRole('link', { name: 'Комнаты', exact: true }).click(); await page.getByText('Названия этажей', { exact: true }).click();
 const floor = page.locator('.metadata-editor').filter({ has: page.getByRole('heading', { name: 'Floor', exact: true }) }); await floor.getByRole('button', { name: 'Изменить название этажа', exact: true }).click(); await floor.getByLabel('Название', { exact: true }).fill('Первый этаж'); await floor.getByRole('button', { name: 'Сохранить изменения', exact: true }).click(); await expect(page.getByText('Изменения сохранены и прочитаны из Core.')).toBeVisible();
 await page.getByRole('link', { name: /Room.*Устройств/ }).click(); await page.getByRole('button', { name: 'Изменить название и размещение', exact: true }).click(); await page.getByLabel('Название', { exact: true }).fill('Гостиная'); await page.getByLabel('Этаж', { exact: true }).selectOption('metadata_floor'); await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click(); await expect(page.getByText('Изменения сохранены и прочитаны из Core.')).toBeVisible();
 expect(await read('/rooms/fixture_room')).toMatchObject({ name: 'Гостиная', floor_id: 'metadata_floor' });
 if (await page.locator('.mobile-more summary').isVisible()) await page.locator('.mobile-more summary').click();
 await page.getByRole('link', { name: 'Устройства', exact: true }).click();
 await page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Software relay', exact: true }) }).getByRole('link', { name: 'Подробнее', exact: true }).click(); await page.getByRole('button', { name: 'Изменить название и размещение', exact: true }).click(); await page.getByLabel('Название', { exact: true }).fill('Свет у окна'); await page.getByLabel('Комната', { exact: true }).selectOption('metadata_room');
 const before = await read('/devices/fixture_relay');
 await patch('/devices/fixture_relay', { name: 'Из другого окна', expected_metadata_revision: before.metadata_revision });
 await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click(); await expect(page.getByRole('button', { name: 'Сравнить с Core', exact: true })).toBeVisible(); await expect(page.getByLabel('Название', { exact: true })).toHaveValue('Свет у окна');
 await page.getByRole('button', { name: 'Сравнить с Core', exact: true }).click(); await expect(page.getByText(/В Core: «Из другого окна»/)).toBeVisible();
 for (const width of [1440, 390]) for (const theme of ['light', 'dark']) { await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 }); const toggle = page.getByRole('button', { name: theme === 'dark' ? 'Включить тёмную тему' : 'Включить светлую тему', exact: true }); if (await toggle.count()) await toggle.click(); await page.screenshot({ path: `test-results/live-metadata-conflict-${width}-${theme}.png`, fullPage: true }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
 await page.getByRole('button', { name: 'Сохранить черновик для новой версии', exact: true }).click(); await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click(); await expect(page.getByText('Изменения сохранены и прочитаны из Core.')).toBeVisible();
 const saved = await read('/devices/fixture_relay'); expect(saved).toMatchObject({ name: 'Свет у окна', room_id: 'metadata_room', metadata_revision: before.metadata_revision + 2 }); expect(saved.state.on).toBe(false);
 await patch('/devices/fixture_relay', { name: 'Stale unsafe write', expected_metadata_revision: before.metadata_revision }, 409);
 for (const actor of ['resident', 'foreign']) { const login = await page.request.post(origin + '/auth/login', { data: { email: `${actor}@example.test`, password } }); expect(login.status()).toBe(200); const token = (await login.json()).access_token; const denied = await page.request.patch(origin + '/devices/fixture_relay', { headers: { Authorization: `Bearer ${token}` }, data: { name: 'Forbidden', expected_metadata_revision: saved.metadata_revision } }); expect([403, 404]).toContain(denied.status()); }
 expect((await read('/devices/fixture_relay')).name).toBe('Свет у окна');
 const evidence = await fetch(`${process.env.RELAY_CONTROL_URL}/evidence`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.RELAY_CONTROL_KEY}`, 'Content-Type': 'application/json' }, body: '{}' }); expect(evidence.status).toBe(200); const proof = await evidence.json(); expect(proof.received).toHaveLength(0); expect(proof.commands).toHaveLength(0);
 await page.screenshot({ path: 'test-results/live-metadata-saved.png', fullPage: true });
});
