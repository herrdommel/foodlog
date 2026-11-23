import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { loginViaApi, registerVerified } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('foodlog.lang', 'en'));
  const { email } = await registerVerified(page);
  await loginViaApi(page, email);
  await page.goto('/ingredients');
  await page.getByRole('heading', { name: 'Ingredients', exact: true }).waitFor();
});

test('creates, edits and deletes an own ingredient', async ({ page }) => {
  const create = page.getByRole('region', { name: 'Create your own ingredient' });
  await create.getByLabel('Name').fill('Grandma soup');
  await create.getByRole('checkbox', { name: 'Celery' }).check();
  await create.getByRole('button', { name: 'Create' }).click();

  const mine = page.getByRole('region', { name: 'My ingredients' });
  await expect(mine.getByText('Grandma soup')).toBeVisible();
  await expect(mine.getByText('used in 0 entries')).toBeVisible();

  await mine.getByRole('button', { name: 'Edit Grandma soup' }).click();
  await mine.getByLabel('Name of Grandma soup').fill('Grandma stew');
  await mine.getByRole('checkbox', { name: 'Gluten' }).check();
  await mine.getByRole('button', { name: 'Save' }).click();
  await expect(mine.getByText('Grandma stew')).toBeVisible();
  await expect(mine.getByText('Gluten')).toBeVisible();

  await mine.getByRole('button', { name: 'Delete Grandma stew' }).click();
  await mine.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(mine.getByText('You have no custom ingredients yet.')).toBeVisible();
});

test('loads more catalog entries while scrolling', async ({ page }) => {
  const catalog = page.getByRole('region', { name: 'Catalog' });
  const items = catalog.getByRole('listitem');
  await expect(items).toHaveCount(50);
  await items.last().scrollIntoViewIfNeeded();
  await expect.poll(() => items.count()).toBeGreaterThan(50);
});

test('shows usage and warns before deleting an ingredient used in entries', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Meal', exact: true }).click();
  await page.getByLabel('Title (optional)').fill('Stew');
  await page.getByLabel('Ingredients').fill('Grandma special');
  await page.getByRole('button', { name: 'Create “Grandma special”' }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Stew' })).toBeVisible();

  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('link', { name: 'Ingredients' }).click();
  const mine = page.getByRole('region', { name: 'My ingredients' });
  await expect(mine.getByText('used in 1 entry')).toBeVisible();
  await expect(mine.getByText(/not analysed at allergen level/)).toBeVisible();
  await mine.getByRole('button', { name: 'Delete Grandma special' }).click();
  await expect(mine.getByText(/It is used in 1 entry/)).toBeVisible();
  await mine.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(mine.getByText('You have no custom ingredients yet.')).toBeVisible();

  await page.getByRole('link', { name: 'Overview' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Stew' })).toBeVisible();
});

test('searches the read-only catalog', async ({ page }) => {
  const catalog = page.getByRole('region', { name: 'Catalog' });
  await catalog.getByLabel('Search the catalog').fill('milk');
  await expect(catalog.getByText('Soy milk')).toBeVisible();
  await expect(catalog.getByText('Lactose').first()).toBeVisible();
  await expect(catalog.getByRole('button')).toHaveCount(0);
});

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`accessibility (${scheme})`, () => {
    test.use({ colorScheme: scheme });

    test('ingredients page has no serious violations', async ({ page }) => {
      await page.getByLabel('Name').first().fill('Tag');
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .flatMap((v) =>
          v.nodes.map((n) => `${v.id}: ${n.target.join(' ')} (${n.any[0]?.message ?? v.help})`),
        );
      expect(serious).toEqual([]);
    });
  });
}
