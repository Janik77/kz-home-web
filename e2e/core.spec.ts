import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { coreResponses, coreHouse, coreDevice, coreRoom, coreFloor, coreScene, tokenPair } from '../src/test/core-fixtures';
import { themeStorageKey } from '../src/app/theme-context';

async function interceptCore(page: Page, overrides: Record<string, unknown> = {}) {
  const requests: { path: string; method: string }[] = [];
  await page.route('**/core-api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/core-api', '') + url.search;
    requests.push({ path, method: request.method() });
    if (path === '/auth/logout') return route.fulfill({ status: 204 });
    const responses = { ...coreResponses, ...overrides };
    if (!(path in responses)) throw new Error(`Unexpected frontend HTTP path: ${path}`);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(responses[path]) });
  });
  return requests;
}
async function login(page: Page) {
  await page.getByLabel('Email', { exact: true }).fill('homeowner@example.test');
  await page.getByLabel('Password', { exact: true }).fill('test-input');
  await page.getByLabel('Password', { exact: true }).press('Enter');
}
async function accessible(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
}

test('signs in, reads a home without controls or mock images, switches homes, and clears the session', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const requests = await interceptCore(page, {
    '/houses': [coreHouse, { ...coreHouse, id: 'house-b', name: 'Weekend home' }],
    '/houses/house-b': { ...coreHouse, id: 'house-b', name: 'Weekend home' },
    '/floors': [coreFloor, { ...coreFloor, id: 'floor-b', house_id: 'house-b' }],
    '/rooms': [coreRoom, { ...coreRoom, id: 'room-b', floor_id: 'floor-b', name: 'Study' }],
    '/devices?house_id=house-b': [],
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome home' })).toBeVisible();
  await accessible(page);
  await page.screenshot({ path: testInfo.outputPath('core-login-light.png'), fullPage: true });
  await login(page);
  await expect(page.getByRole('heading', { name: 'Your homes', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Family home' }).click();
  await expect(page.getByRole('heading', { name: 'Добро пожаловать домой', level: 1 })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Reading light · Living room' })).toContainText('Включён · 45%');
  await expect(page.getByRole('switch')).toHaveCount(0);
  await expect(page.getByRole('slider')).toHaveCount(0);
  await expect(page.locator('img')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Activate/ })).toHaveCount(0);
  await accessible(page);
  await page.getByRole('button', { name: 'Use dark theme' }).click();
  await accessible(page);
  await page.screenshot({ path: testInfo.outputPath('core-home-dark.png'), fullPage: true });
  await page.getByRole('link', { name: 'Все сценарии' }).click();
  await page.getByText('View controls (1)').click();
  await expect(page.getByText('Power: On · Brightness: 25%')).toBeVisible();
  await accessible(page);
  const navigation = page.getByRole('navigation', { name: page.viewportSize()!.width < 768 ? 'Mobile navigation' : 'Main navigation' });
  await navigation.getByRole('link', { name: 'Комнаты', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Rooms', level: 1 })).toBeVisible();
  await accessible(page);
  await page.getByRole('link', { name: /Living room.*devices/ }).click();
  await expect(page.getByRole('heading', { name: 'Living room', level: 1 })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Reading light in Living room' })).toBeVisible();
  await expect(page.getByRole('switch')).toHaveCount(0);
  await accessible(page);
  await page.getByRole('link', { name: 'Account & homes' }).click();
  await page.getByRole('combobox', { name: 'Home', exact: true }).selectOption('house-b');
  await expect(page.getByRole('heading', { name: 'Добро пожаловать домой', level: 1 })).toBeVisible();
  await expect(page.getByText('Устройств пока нет.', { exact: true })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Reading light · Living room' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Study', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Аккаунт и дома' }).click();
  await accessible(page);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome home' })).toBeVisible();
  await accessible(page);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([themeStorageKey]);
  expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome home' })).toBeVisible();
  expect(requests.filter((request) => request.method !== 'GET').map((request) => request.path)).toEqual(['/auth/login', '/auth/logout']);
  expect(errors).toEqual([]);
});

test('shows login failure, Core unavailability and no accessible homes without mock fallback', async ({ page }) => {
  await interceptCore(page, { '/houses': [] });
  let attempt = 0;
  await page.route('**/core-api/auth/login', async (route) => {
    attempt++;
    return route.fulfill({ status: attempt === 1 ? 401 : attempt === 2 ? 503 : 200, contentType: 'application/json', body: JSON.stringify(attempt < 3 ? { detail: 'private-input' } : tokenPair) });
  });
  await page.goto('/'); await login(page);
  await expect(page.getByText('The email or password wasn’t accepted. Please try again.')).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue(''); await accessible(page);
  await login(page); await expect(page.getByText('Core is temporarily unavailable. Please try again in a moment.')).toBeVisible();
  await login(page); await expect(page.getByRole('heading', { name: 'No accessible homes' })).toBeVisible();
  await accessible(page);
  await expect(page.getByText('private-input')).toHaveCount(0);
});

test('keeps partial device state visible and expires a rejected session', async ({ page }) => {
  const requests = await interceptCore(page, {
    '/devices?house_id=house-a': [
      { ...coreDevice, type: 'relay', capabilities: ['on_off'], state: {} },
      { ...coreDevice, id: 'temperature-a', name: 'Room temperature', type: 'temperature_sensor', capabilities: ['temperature'], state: { temperature: 22.4 }, online: false },
    ], '/scenes': [coreScene],
  });
  await page.goto('/'); await login(page);
  await expect(page.getByRole('heading', { name: 'Добро пожаловать домой', level: 1 })).toBeVisible();
  await expect(page.getByText('Нет данных о состоянии', { exact: true })).toBeVisible();
  await expect(page.getByText('Не в сети: 1 устройство', { exact: true })).toBeVisible();
  await accessible(page);
  await page.getByRole('button', { name: 'Use dark theme' }).click(); await accessible(page);
  await page.route('**/core-api/auth/refresh', (route) => route.fulfill({ status: 401 }));
  await page.route('**/core-api/houses/house-a', (route) => route.fulfill({ status: 401 }));
  await page.getByRole('button', { name: 'Обновить данные' }).click();
  await expect(page.getByText('Your session has expired. Sign in again to continue.')).toBeVisible();
  await expect(page.getByRole('article', { name: 'Reading light · Living room' })).toHaveCount(0);
  await accessible(page);
  expect(requests.some((request) => request.path.includes('/state') || request.path.endsWith('/run'))).toBe(false);
});

test('keeps Cyrillic last-known ON data offline and distinguishes restricted access', async ({ page }) => {
  const roomName = 'Гостиная с панорамными окнами';
  const deviceName = 'Освещение зоны отдыха';
  const requests = await interceptCore(page, {
    '/houses': [{ ...coreHouse, name: 'Дом в Алматы' }],
    '/houses/house-a': { ...coreHouse, name: 'Дом в Алматы' },
    '/rooms': [{ ...coreRoom, name: roomName }],
    '/devices?house_id=house-a': [{ ...coreDevice, name: deviceName, online: false, state: { on: true, brightness: 45 } }],
  });
  await page.goto('/');
  await page.getByLabel('Password', { exact: true }).fill('fixture-only');
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
  await login(page);
  await page.evaluate(() => { document.documentElement.lang = 'ru'; });
  const card = page.getByRole('article', { name: `${deviceName} · ${roomName}` });
  await expect(card).toContainText('Core сообщает: не в сети');
  await expect(card).toContainText('Не в сети · последнее: Включён · 45%');
  await expect(card).not.toHaveClass(/signature-device--active/);
  await expect(page.getByRole('switch')).toHaveCount(0);
  await expect(page.getByRole('slider')).toHaveCount(0);
  await accessible(page);
  await page.route('**/core-api/houses/house-a', (route) => route.fulfill({ status: 403, contentType: 'application/json', body: '{"detail":"not displayed"}' }));
  await page.getByRole('button', { name: 'Обновить данные' }).click();
  await expect(page.getByRole('heading', { name: 'Доступ ограничен' })).toBeVisible();
  await expect(card).toHaveCount(0);
  await accessible(page);
  expect(requests.filter((r) => r.method !== 'GET').map((r) => r.path)).toEqual(['/auth/login']);
});
