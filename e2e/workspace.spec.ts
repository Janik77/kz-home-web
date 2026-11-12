import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('device search, offline filtering and honest integration placeholders', async ({ page }) => {
  await page.goto('/devices');
  await expect(page.getByRole('heading', { name: 'Устройства', exact: true })).toBeVisible();
  const more = page.locator('.mobile-more summary');
  if (await more.isVisible()) {
    await more.focus(); await more.press('Enter');
    await expect(page.locator('.mobile-more').getByRole('link', { name: 'Журнал' })).toBeVisible();
    await page.locator('.mobile-more').getByRole('link', { name: 'Устройства' }).click();
    await expect(page.locator('.mobile-more')).not.toHaveAttribute('open');
  }
  await page.getByRole('combobox', { name: 'Подключение' }).selectOption('offline');
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('switch')).toBeDisabled();
  await page.getByRole('searchbox').fill('nothing-matches-this');
  await expect(page.getByRole('heading', { name: 'Устройства не найдены' })).toBeVisible();
  for (const route of ['/automations', '/events']) {
    await page.goto(route);
    await expect(page.getByRole('heading', { name: 'Доступно при подключении к Core' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  }
});
