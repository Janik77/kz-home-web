// Intercepted presentation matrix only. Live Core/relay evidence is separate.
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';
import { coreResponses, coreHouse, coreFloor, coreRoom, coreDevice } from '../src/test/core-fixtures';
import { themeStorageKey } from '../src/app/theme-context';
for (const theme of ['light', 'dark']) for (const shape of ['single', 'populated', 'empty', 'offline']) test(`compact home ${shape} ${theme}`, async ({ page }, info) => {
 const roomName = 'Гостиная — семейная комната с окнами во двор';
 const rooms = shape === 'empty' ? [] : Array.from({ length: shape === 'populated' ? 6 : 1 }, (_, i) => ({ ...coreRoom, id: `room-${i}`, name: i ? `Комната ${i + 1}` : roomName, metadata_revision: 1 }));
 const devices = rooms.flatMap((room, i) => Array.from({ length: shape === 'populated' ? 2 : 1 }, (_, j) => ({ ...coreDevice, id: `relay-${i}-${j}`, room_id: room.id, name: i || j ? `Освещение ${i + 1}.${j + 1}` : 'Свет у окна', type: 'relay', state: { on: false }, capabilities: ['on_off'], online: shape !== 'offline', metadata_revision: 1 })));
 await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: themeStorageKey, value: theme });
 await page.route('**/core-api/**', async route => {
  const req = route.request(), url = new URL(req.url()), path = url.pathname.replace('/core-api', '') + url.search;
  expect(req.method()).toBe(path === '/auth/login' ? 'POST' : 'GET');
  if (path.endsWith('/me/permissions')) return route.fulfill({ json: { house_id: 'house-a', permissions: ['house.read', 'house.manage', 'device.read', 'device.manage', 'device.control', 'event.read'] } });
  if (path.includes('/me/device-favorites')) return route.fulfill({ json: { device_ids: [] } });
  if (path.startsWith('/events') || path === '/automations' || path === '/scenes') return route.fulfill({ json: [] });
  const rows: Record<string, unknown> = { ...coreResponses, '/houses': [{ ...coreHouse, name: 'Наш дом', metadata_revision: 1 }], '/houses/house-a': { ...coreHouse, name: 'Наш дом', metadata_revision: 1 }, '/floors': [{ ...coreFloor, name: 'Первый этаж', metadata_revision: 1 }], '/rooms': rooms, '/devices?house_id=house-a': devices };
  const device = devices.find(d => path === `/devices/${d.id}`); if (device) return route.fulfill({ json: device });
  if (!(path in rows)) throw Error(`Unspecified fixture route: ${path}`); return route.fulfill({ json: rows[path] });
 });
 await page.goto('/'); await page.getByLabel('Электронная почта', { exact: true }).fill('owner@example.test'); await page.getByLabel('Пароль', { exact: true }).fill('fixture-only'); await page.getByLabel('Пароль', { exact: true }).press('Enter');
 await expect(page.getByRole('heading', { name: 'Наш дом', exact: true })).toBeVisible();
 const overflow = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
 await overflow();
 if (page.viewportSize()!.width >= 1366) {
  const deviceSection = (await page.locator('.everyday-devices').boundingBox())!, roomsSection = (await page.locator('.everyday-overview').boundingBox())!;
  expect(roomsSection.x).toBeGreaterThanOrEqual(deviceSection.x + deviceSection.width);
  expect(Math.abs(roomsSection.y - deviceSection.y)).toBeLessThanOrEqual(1);
 }
 if (devices.length) {
  const card = page.getByRole('article').first(); await expect(card.getByRole('button', { name: 'Добавить в избранное: Свет у окна' })).toHaveCount(1);
  const box = (await card.boundingBox())!; expect(box.width).toBeGreaterThanOrEqual(250); expect(box.height).toBeLessThan(450);
  const star = (await card.getByRole('button', { name: 'Добавить в избранное: Свет у окна' }).boundingBox())!;
  expect(star.y - box.y).toBeLessThan(40); expect(star.x + star.width).toBeLessThanOrEqual(box.x + box.width);
  if (shape === 'offline') await expect(card.getByRole('button', { name: 'Включить', exact: true })).toBeDisabled();
 }
 await page.screenshot({ path: info.outputPath(`compact-${shape}-home-${theme}.png`), fullPage: true });
 if (shape === 'single') expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
 await page.getByRole('link', { name: 'Комнаты', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Комнаты', exact: true })).toBeVisible(); await overflow();
 await expect(page.getByRole('button', { name: 'Добавить комнату или этаж' })).toBeVisible();
 await page.screenshot({ path: info.outputPath(`compact-${shape}-rooms-${theme}.png`), fullPage: true });
 if (rooms.length) {
  await page.locator('a[href="/rooms/room-0"]').click(); await expect(page.getByRole('heading', { name: roomName, exact: true })).toBeVisible(); await overflow();
  await expect(page.getByRole('article').first()).toBeVisible();
  await page.screenshot({ path: info.outputPath(`compact-${shape}-room-${theme}.png`), fullPage: true });
 }
});
