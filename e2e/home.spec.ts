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
  await expect(page.getByRole('heading', { name: 'Демонстрационный дом', level: 1 })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Потолочный свет · Гостиная' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  for (const image of await page.locator('img').all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  const imageHealth = await page.locator('img').evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0));
  expect(imageHealth).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('home-light.png'), fullPage: true });
  await page.getByRole('button', { name: 'Включить тёмную тему' }).click();
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
  const brightness = page.getByRole('slider', { name: 'Потолочный свет · яркость · Гостиная' });
  await brightness.focus();
  await brightness.press('Home');
  await expect(brightness).toHaveValue('0');
  await expect(light).toBeEnabled();
  await expect(brightness).toBeFocused();
  await brightness.press('ArrowRight');
  await expect(light).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Запустить Уютный вечер' }).click();
  await expect(page.getByText('Уютный вечер: выполнено · обновлено: 3. Только симуляция.')).toBeVisible();
  await expect(brightness).toHaveValue('35');
  await page.getByRole('button', { name: 'Запустить Ушёл из дома' }).click();
  await expect(page.getByText('Ушёл из дома: частично выполнено · обновлено: 5 · Пропущено: 1 (нет связи или доступа). Только симуляция.')).toBeVisible();
  await expect(light).toHaveAttribute('aria-checked', 'false');
});

test('navigates rooms and checks offline controls and route accessibility', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/rooms');
  await expect(page.getByRole('heading', { name: 'Комнаты', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Второй этаж', exact: true }).click();
  await expect(page.getByRole('link', { name: /Гостиная.*Устройств/ })).toHaveCount(0);
  await page.getByRole('link', { name: /Кабинет.*Устройств/ }).click();
  await expect(page.getByRole('heading', { name: 'Кабинет', exact: true })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Настольная лампа · Кабинет' })).toBeDisabled();
  await expect(page.getByText('Не в сети · последнее состояние')).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  for (const route of ['/rooms', '/rooms/living', '/devices', '/scenes', '/automations', '/events', '/settings']) {
    await page.goto(route);
    await expect(page.locator('h1')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
    for (const theme of ['light', 'dark'] as const) {
      if ((await page.locator('html').getAttribute('data-theme')) !== theme) await page.getByRole('button', { name: theme === 'dark' ? 'Включить тёмную тему' : 'Включить светлую тему' }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
      expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    }
  }
  await page.getByRole('radio', { name: /Тёмная/ }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('radio', { name: /Системная/ }).check();
  await expect(page.getByRole('radio', { name: /Системная/ })).toBeChecked();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.goto('/rooms/unknown');
  await expect(page.getByRole('heading', { name: 'Комната не найдена' })).toBeVisible();
  await page.goto('/unknown');
  await expect(page.getByRole('heading', { name: 'Страница не найдена' })).toBeVisible();
});

test('puts shared controls within reach, exposes device attention, and renders grouped rooms and inspectable scenes', async ({ page }, testInfo) => {
  await page.goto('/');
  const light = page.getByRole('switch', { name: 'Потолочный свет · Гостиная' });
  await expect(light).toBeVisible();
  const bounds = await light.boundingBox();
  expect(bounds?.width).toBeGreaterThanOrEqual(44);
  expect(bounds?.height).toBeGreaterThanOrEqual(44);
  expect(bounds!.y + bounds!.height).toBeLessThan(page.viewportSize()!.height - 80);
  await expect(page.locator('.device-card')).toHaveCount(4);
  // One-column cards retain readable controls; composition is reviewed in the separate matrix.
  await light.scrollIntoViewIfNeeded();
  const slider = page.getByRole('slider', { name: 'Потолочный свет · яркость · Гостиная' });
  expect((await slider.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await page.getByRole('link', { name: /Кабинет.*нет связи: 1/ }).click();
  await expect(page.getByRole('switch', { name: 'Настольная лампа · Кабинет' })).toBeDisabled();
  for (const route of ['/rooms/living', '/scenes']) {
    await page.goto(route);
    await expect(page.locator('h1')).toBeVisible();
    if (route.includes('/rooms/')) {
      await expect(page.getByRole('heading', { name: 'Устройства', exact: true })).toBeVisible();
      await expect(page.getByRole('article')).toHaveCount(3);
      await expect(page.getByRole('heading', { name: 'Быстрые сценарии' })).toBeVisible();
    } else {
      const card = page.getByRole('article', { name: 'Ушёл из дома' });
      await card.getByText('Действия (6)').click();
      await expect(card.getByText('Настольная лампа', { exact: false })).toBeVisible();
    }
    for (const theme of ['light', 'dark'] as const) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: theme === 'dark' ? 'Включить тёмную тему' : 'Включить светлую тему' }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
      await page.screenshot({ path: testInfo.outputPath(`${route.includes('/rooms/') ? 'room' : 'scenes'}-${theme}.png`), fullPage: true });
    }
  }
});

test('supports keyboard navigation and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Демонстрационный дом', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'К содержимому' }).focus();
  await expect(page.getByRole('link', { name: 'К содержимому' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  const scene = page.getByRole('button', { name: 'Запустить Спокойной ночи' });
  await scene.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Спокойной ночи: выполнено · обновлено: 4. Только симуляция.')).toBeVisible();
  expect(await scene.evaluate((element) => Number.parseFloat(getComputedStyle(element).transitionDuration))).toBeLessThanOrEqual(0.00001);
});
