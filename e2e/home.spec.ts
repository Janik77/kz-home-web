import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const browserErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
});
test.afterEach(({ page }) => { expect(browserErrors.get(page)).toEqual([]); });

test('renders home without overflow or broken images, with accessible light and dark themes', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Добро пожаловать домой', level: 1 })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Потолочный свет · Гостиная' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  for (const image of await page.locator('img').all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  const imageHealth = await page.locator('img').evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0));
  expect(imageHealth).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('home-light.png'), fullPage: true });
  await page.getByRole('button', { name: 'Use dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('home-dark.png'), fullPage: true });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('switches devices, commits keyboard sliders, and reports scene skips', async ({ page }) => {
  await page.goto('/');
  const light = page.getByRole('switch', { name: 'Потолочный свет · Гостиная' });
  await expect(light).toHaveAttribute('aria-checked', 'true');
  await light.click();
  await expect(light).toHaveAttribute('aria-checked', 'false');
  await expect(light).toBeEnabled();
  const brightness = page.getByRole('slider', { name: 'Яркость: Потолочный свет · Гостиная' });
  await brightness.focus();
  await brightness.press('Home');
  await expect(brightness).toHaveValue('0');
  await expect(light).toBeEnabled();
  await expect(brightness).toBeFocused();
  await brightness.press('ArrowRight');
  await expect(light).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Запустить сценарий: Уютный вечер' }).click();
  await expect(page.getByText('Симуляция «Уютный вечер»: обновлено 3, пропущено 0. Не подтверждение оборудования.')).toBeVisible();
  await expect(brightness).toHaveValue('35');
  await page.getByRole('button', { name: 'Запустить сценарий: Ушёл из дома' }).click();
  await expect(page.getByText('Симуляция «Ушёл из дома»: обновлено 5, пропущено 1. Не подтверждение оборудования.')).toBeVisible();
  await expect(light).toHaveAttribute('aria-checked', 'false');
});

test('navigates rooms and checks offline controls and route accessibility', async ({ page }) => {
  await page.goto('/rooms');
  await expect(page.getByRole('heading', { name: 'Rooms', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'First floor', exact: true }).click();
  await expect(page.getByRole('link', { name: /Living room.*devices/ })).toHaveCount(0);
  await page.getByRole('link', { name: /Home office.*devices/ }).click();
  await expect(page.getByRole('heading', { name: 'Home office', exact: true })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Desk lamp in Home office' })).toBeDisabled();
  await expect(page.getByText('Offline · last known state')).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  for (const route of ['/rooms', '/rooms/living', '/scenes', '/settings']) {
    await page.goto(route);
    await expect(page.locator('h1')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const theme of ['light', 'dark'] as const) {
      if ((await page.locator('html').getAttribute('data-theme')) !== theme) await page.getByRole('button', { name: `Use ${theme} theme` }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    }
  }
  await page.getByRole('radio', { name: /Dark/ }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('radio', { name: /System/ }).check();
  await expect(page.getByRole('radio', { name: /System/ })).toBeChecked();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.goto('/rooms/unknown');
  await expect(page.getByRole('heading', { name: 'Room not found' })).toBeVisible();
  await page.goto('/unknown');
  await expect(page.getByRole('heading', { name: 'This page isn’t here' })).toBeVisible();
});

test('matches Signature composition, exposes device attention, and renders grouped rooms and inspectable scenes', async ({ page }, testInfo) => {
  await page.goto('/');
  const light = page.getByRole('switch', { name: 'Потолочный свет · Гостиная' });
  await expect(light).toBeVisible();
  const bounds = await light.boundingBox();
  expect(bounds?.width).toBeGreaterThanOrEqual(44);
  expect(bounds?.height).toBeGreaterThanOrEqual(44);
  expect(await page.locator('.signature-home > section').evaluateAll((sections) => sections.map((section) => section.className))).toEqual(['signature-quick', 'signature-rooms', 'signature-favorites', 'signature-system']);
  await light.scrollIntoViewIfNeeded();
  const slider = page.getByRole('slider', { name: 'Яркость: Потолочный свет · Гостиная' });
  expect((await slider.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await page.getByText('Не в сети: 1 устройство', { exact: true }).click();
  await page.getByRole('link', { name: 'Настольная лампа · Кабинет' }).click();
  await expect(page.locator('#device-office-lamp')).toBeFocused();
  await expect(page.getByRole('switch', { name: 'Desk lamp in Home office' })).toBeDisabled();
  for (const route of ['/rooms/living', '/scenes']) {
    await page.goto(route);
    await expect(page.locator('h1')).toBeVisible();
    if (route.includes('/rooms/')) {
      await expect(page.getByRole('heading', { name: 'Lighting', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Curtains', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Climate & sensors', exact: true })).toBeVisible();
    } else {
      const card = page.getByRole('article', { name: 'Leaving home' });
      await card.getByText('View controls (6)').click();
      await expect(card.getByText('Desk lamp', { exact: false })).toBeVisible();
    }
    for (const theme of ['light', 'dark'] as const) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: `Use ${theme} theme` }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`${route.includes('/rooms/') ? 'room' : 'scenes'}-${theme}.png`), fullPage: true });
    }
  }
});

test('supports keyboard navigation and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Добро пожаловать домой', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'К содержимому' }).focus();
  await expect(page.getByRole('link', { name: 'К содержимому' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  const scene = page.getByRole('button', { name: 'Запустить сценарий: Спокойной ночи' });
  await scene.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Симуляция «Спокойной ночи»: обновлено 4, пропущено 0. Не подтверждение оборудования.')).toBeVisible();
  expect(await scene.evaluate((element) => Number.parseFloat(getComputedStyle(element).transitionDuration))).toBeLessThanOrEqual(0.00001);
});
