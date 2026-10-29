import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { disposableAccount } from './live-core-support';

// No routes, fulfill(), intercepted fixtures, fake tokens, or Core runtime changes.
// Disable credential-bearing traces/screenshots in playwright.live.config.ts.
test('LIVE browser → Vite proxy → Core → PostgreSQL acceptance', async ({ page }) => {
  test.setTimeout(90_000);
  const account = disposableAccount();
  const { ids } = account;
  const requests: { path: string; method: string }[] = [];
  const errors: string[] = [];
  page.on('pageerror', () => errors.push('browser error'));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/core-api/')) requests.push({ path: url.pathname.slice('/core-api'.length), method: request.method() });
  });
  const responseFor = (path: string) => page.waitForResponse((response) => new URL(response.url()).pathname === `/core-api${path}`);
  async function signIn() {
    await page.getByLabel('Email', { exact: true }).fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill(account.password);
    const login = responseFor('/auth/login');
    const me = responseFor('/auth/me');
    await page.getByLabel('Password', { exact: true }).press('Enter');
    const result = await login;
    expect(result.status()).toBe(200);
    const user = await me;
    expect(user.status()).toBe(200);
    expect((await user.json()).email === account.email).toBe(true);
    return result.json();
  }
  async function signOut() {
    const logout = responseFor('/auth/logout');
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    expect((await logout).status()).toBe(204);
    await expect(page.getByRole('heading', { name: 'Welcome home' })).toBeVisible();
  }
  async function api(path: string, method = 'GET', body?: unknown, token?: string, status = 200) {
    const response = await fetch(`http://127.0.0.1:18000${path}`, {
      method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    expect(response.status, `${method} ${path}`).toBe(status);
    return response.status === 204 ? undefined : response.json();
  }
  const navigation = (target: Page) => target.getByRole('navigation', { name: target.viewportSize()!.width < 768 ? 'Mobile navigation' : 'Main navigation' });
  try {
    for (const endpoint of ['/health', '/ready']) await api(endpoint);
    await api('/auth/me', 'GET', undefined, undefined, 401);
    await api('/houses', 'GET', undefined, undefined, 401);
    account.operator('create');
    await page.clock.install({ time: new Date() });
    await page.goto('/');
    await signIn();
    await expect(page.getByRole('heading', { name: 'No accessible homes' })).toBeVisible();
    await signOut();

    // Operator-only fixture writes through actual HTTP. Never commands or /run.
    const setup = await api('/auth/login', 'POST', { email: account.email, password: account.password });
    const token: string = setup.access_token;
    await api('/houses', 'POST', { id: ids.home, name: 'Live acceptance home' }, token, 201);
    await api('/houses', 'POST', { id: ids.empty, name: 'Live empty home' }, token, 201);
    await api('/floors', 'POST', { id: ids.floor, house_id: ids.home, name: 'Live floor', order: 0 }, token, 201);
    await api('/rooms', 'POST', { id: ids.room, floor_id: ids.floor, name: 'Live room' }, token, 201);
    await api('/devices', 'POST', { id: ids.light, room_id: ids.room, name: 'Live reading light', type: 'light', state: { on: true, brightness: 37 }, capabilities: ['on_off', 'brightness'] }, token, 201);
    await api('/devices', 'POST', { id: `${account.prefix}-relay`, room_id: ids.room, name: 'Live partial relay', type: 'relay', state: {}, capabilities: ['on_off'], online: false }, token, 201);
    await api('/scenes', 'POST', { id: ids.scene, house_id: ids.home, name: 'Live reading scene', actions: [{ type: 'device_state', device_id: ids.light, state: { on: true, brightness: 25 } }] }, token, 201);
    await api('/auth/logout', 'POST', { refresh_token: setup.refresh_token }, undefined, 204);
    const stored = account.operator('inspect');
    expect(stored).toMatchObject({ userExists: true, houses: 2, rooms: 1, scenes: 1, deviceState: { on: true, brightness: 37 }, activeSessions: 0 });

    const housesRead = responseFor('/houses');
    const current = await signIn();
    const houses = await (await housesRead).json();
    expect(houses.map((house: { id: string }) => house.id).sort()).toEqual([ids.home, ids.empty].sort());
    await expect(page.getByRole('heading', { name: 'Your homes', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Live acceptance home', exact: true }).click();
    await expect(page.getByRole('article', { name: 'Live reading light in Live room' })).toContainText('37% brightness');
    await expect(page.getByRole('article', { name: 'Live partial relay in Live room' })).toContainText('No reported state yet');
    await expect(page.getByRole('switch')).toHaveCount(0);
    await expect(page.getByRole('slider')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Activate/ })).toHaveCount(0);
    await expect(page.locator('img')).toHaveCount(0);
    await navigation(page).getByRole('link', { name: 'Rooms', exact: true }).click();
    await page.getByRole('link', { name: /Live room.*devices/ }).click();
    await expect(page.getByRole('heading', { name: 'Live room', level: 1 })).toBeVisible();
    await navigation(page).getByRole('link', { name: 'Scenes', exact: true }).click();
    await page.getByText('View controls (1)').click();
    await expect(page.getByText('Power: On · Brightness: 25%')).toBeVisible();

    // Advance browser wall time only. Core still validates real JWTs on its clock.
    // The unmodified Web session sees its deadline and rotates via real HTTP.
    await page.clock.setFixedTime(new Date(Date.now() + 16 * 60_000));
    const refresh = responseFor('/auth/refresh');
    const refreshedHouse = responseFor(`/houses/${ids.home}`);
    await page.getByRole('button', { name: 'Refresh home' }).click();
    const rotation = await refresh;
    expect(rotation.status()).toBe(200);
    const rotated = await rotation.json();
    expect((await refreshedHouse).status()).toBe(200);
    expect(rotated.refresh_token !== current.refresh_token).toBe(true);
    await api('/auth/refresh', 'POST', { refresh_token: current.refresh_token }, undefined, 401);
    expect(account.operator('inspect').activeSessions).toBe(1);
    expect(account.operator('inspect').revokedSessions).toBeGreaterThanOrEqual(3);

    await page.getByRole('link', { name: 'Account & homes' }).click();
    await page.getByRole('combobox', { name: 'Home', exact: true }).selectOption(ids.empty);
    await expect(page.getByRole('heading', { name: 'No devices here yet' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Make space for your home' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No scenes yet' })).toBeVisible();
    await expect(page.getByRole('article', { name: 'Live reading light in Live room' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Account & homes' }).click();
    await signOut();
    await api('/auth/refresh', 'POST', { refresh_token: rotated.refresh_token }, undefined, 401);
    // Core logout revokes refresh, not previously issued access JWTs.
    await api('/auth/me', 'GET', undefined, rotated.access_token);
    expect(account.operator('inspect').activeSessions).toBe(0);
    await signIn();
    await expect(page.getByRole('heading', { name: 'Your homes', exact: true })).toBeVisible();
    await signOut();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Welcome home' })).toBeVisible();
    const storage = await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }));
    expect(storage.local.every((key) => key === 'kz-home-theme')).toBe(true);
    expect(storage.session).toEqual([]);
    expect(requests.filter((request) => request.method !== 'GET').every((request) => request.method === 'POST' && ['/auth/login', '/auth/refresh', '/auth/logout'].includes(request.path))).toBe(true);
    for (const path of ['/auth/me', '/houses', `/houses/${ids.home}`, '/floors', '/rooms', '/devices', '/scenes']) expect(requests.some((request) => request.path === path)).toBe(true);
    expect(account.operator('inspect').deviceState).toEqual({ on: true, brightness: 37 });
    expect(errors).toEqual([]);
  } finally {
    account.operator('cleanup');
    expect(account.operator('inspect')).toMatchObject({ userExists: false, houses: 0, rooms: 0, scenes: 0, deviceState: null, activeSessions: 0, revokedSessions: 0 });
  }
});
