// Intercepted contract fixtures, NOT evidence of a live Core or physical devices.
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';
import { coreResponses, coreHouse, coreFloor, coreRoom, coreDevice } from '../src/test/core-fixtures';
import { themeStorageKey } from '../src/app/theme-context';
for (const theme of ['light', 'dark']) test(`metadata rename, move and conflict ${theme}`, async ({ page }, info) => {
 await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: themeStorageKey, value: theme });
 const rows: Record<string, Record<string, unknown>> = {
  '/houses/house-a': { ...coreHouse, timezone: 'Asia/Almaty', timezone_revision: 1, metadata_revision: 1 },
  '/floors/floor-a': { ...coreFloor, metadata_revision: 1 },
  '/floors/floor-b': { ...coreFloor, id: 'floor-b', name: 'Второй этаж', metadata_revision: 1 },
  '/rooms/room-a': { ...coreRoom, metadata_revision: 1 },
  '/rooms/room-b': { ...coreRoom, id: 'room-b', name: 'Кабинет', floor_id: 'floor-b', metadata_revision: 1 },
  '/devices/lamp-a': { ...coreDevice, type: 'relay', capabilities: ['on_off'], state: { on: true }, metadata_revision: 1 },
 };
 let writes = 0;
 await page.route('**/core-api/**', async route => {
  const req = route.request(), url = new URL(req.url()), path = url.pathname.replace('/core-api', '') + url.search;
  if (route.request().method() === 'GET' && /^\/v1\/houses\/house-[ab]\/software-device-candidates$/.test(path)) return route.fulfill({status:404});
  if (path.endsWith('/me/permissions')) return route.fulfill({ json: { house_id: 'house-a', permissions: ['house.read', 'house.manage', 'device.read', 'device.manage', 'event.read'] } });
  if (path.includes('/me/device-favorites')) return route.fulfill({ json: { device_ids: [] } });
  if (path.startsWith('/events') || path === '/automations') return route.fulfill({ json: [] });
  if (rows[path]) {
   if (req.method() === 'PATCH') { const { expected_metadata_revision, ...body } = req.postDataJSON(); expect(expected_metadata_revision).toBe(rows[path].metadata_revision); rows[path] = { ...rows[path], ...body, metadata_revision: Number(rows[path].metadata_revision) + 1 }; writes++; }
   return route.fulfill({ json: rows[path] });
  }
  const collection = path === '/devices?house_id=house-a' ? '/devices/' : ['/houses', '/floors', '/rooms'].includes(path) ? `${path}/` : null;
  if (collection) return route.fulfill({ json: Object.entries(rows).filter(([key]) => key.startsWith(collection)).map(([, value]) => value) });
  if (!(path in coreResponses)) throw Error(path); return route.fulfill({ json: coreResponses[path] });
 });
 await page.goto('/'); await page.getByLabel('Электронная почта', { exact: true }).fill('owner@example.test'); await page.getByLabel('Пароль', { exact: true }).fill('fixture-only'); await page.getByLabel('Пароль', { exact: true }).press('Enter');
 await expect(page.getByRole('heading', { name: 'Family home', exact: true })).toBeVisible();
 await page.getByRole('link', { name: 'Настройки', exact: true }).click(); await page.getByRole('button', { name: 'Изменить название дома', exact: true }).click(); await page.getByLabel('Название', { exact: true }).fill('Наш дом'); await page.getByRole('button', { name: 'Выйти', exact: true }).click(); await expect(page.getByRole('dialog')).toContainText('Есть несохранённые изменения'); await page.getByRole('button', { name: 'Остаться', exact: true }).click(); await expect(page.getByLabel('Название', { exact: true })).toHaveValue('Наш дом'); await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click(); await expect(page.getByText('Изменения сохранены и прочитаны из Core.')).toBeVisible(); await expect(page.getByRole('option', { name: 'Наш дом', exact: true })).toHaveCount(1);
 await page.screenshot({ path: info.outputPath(`metadata-house-${theme}.png`), fullPage: true });
 await page.getByRole('link', { name: 'Комнаты', exact: true }).click(); await page.getByText('Ground floor · действия', { exact: true }).click(); const floor = page.locator('.metadata-editor').filter({ has: page.getByRole('heading', { name: 'Ground floor', exact: true }) }); await floor.getByRole('button', { name: 'Изменить название этажа', exact: true }).click(); await floor.getByLabel('Название', { exact: true }).fill('Первый этаж'); await floor.getByRole('button', { name: 'Сохранить изменения', exact: true }).click(); await expect(page.getByText('Изменения сохранены и прочитаны из Core.')).toBeVisible();
 await page.getByRole('link', { name: /Living room/ }).first().click(); await page.getByText('Настройки комнаты', { exact: true }).click(); await page.getByRole('button', { name: 'Изменить название и размещение', exact: true }).click(); await page.getByLabel('Название', { exact: true }).fill('Гостиная'); await page.getByLabel('Этаж', { exact: true }).selectOption('floor-b'); await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click(); await expect(page.getByText('Изменения сохранены и прочитаны из Core.')).toBeVisible();
 await page.screenshot({ path: info.outputPath(`metadata-room-${theme}.png`), fullPage: true });
 // Client-side navigation keeps the authenticated in-memory session.
 if (await page.locator('.mobile-more summary').isVisible()) await page.locator('.mobile-more summary').click();
 await page.getByRole('link', { name: 'Устройства', exact: true }).click();
 await page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Reading light', exact: true }) }).getByRole('link', { name: 'Подробнее', exact: true }).click(); await page.getByRole('button', { name: 'Изменить название и размещение', exact: true }).click(); await page.getByLabel('Название', { exact: true }).fill('Свет у окна'); await page.getByLabel('Комната', { exact: true }).selectOption('room-b');
 rows['/devices/lamp-a'] = { ...rows['/devices/lamp-a'], name: 'Из другого окна', metadata_revision: 2 };
 await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click(); await expect(page.getByRole('button', { name: 'Сравнить с Core', exact: true })).toBeVisible(); await expect(page.getByLabel('Название', { exact: true })).toHaveValue('Свет у окна'); expect(writes).toBe(3);
 await page.getByRole('button', { name: 'Сравнить с Core', exact: true }).click(); await expect(page.getByText(/В Core: «Из другого окна»/)).toBeVisible();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
 await page.screenshot({ path: info.outputPath(`metadata-conflict-${theme}.png`), fullPage: true });
 await page.getByRole('button', { name: 'Сохранить черновик для новой версии', exact: true }).click(); expect(writes).toBe(3); await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click(); await expect(page.getByText('Изменения сохранены и прочитаны из Core.')).toBeVisible(); expect(writes).toBe(4); expect(rows['/devices/lamp-a']!.room_id).toBe('room-b'); expect(rows['/devices/lamp-a']!.state).toEqual({ on: true });
 await page.screenshot({ path: info.outputPath(`metadata-device-${theme}.png`), fullPage: true });
});
