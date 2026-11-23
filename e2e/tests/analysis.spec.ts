import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { choose, loginViaApi, registerVerified, seedDemoData } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('foodlog.lang', 'en'));
  const { email } = await registerVerified(page);
  await seedDemoData(page, email);
  await loginViaApi(page, email);
  await page.goto('/analysis');
  await page.getByRole('heading', { name: 'Analysis', exact: true }).waitFor();
});

test('shows the disclaimer, summary and suspects from demo data', async ({ page }) => {
  await expect(page.getByRole('note')).toContainText('not a diagnosis');

  const ingredients = page.getByRole('table', { name: 'Possible intolerances: By ingredient' });
  await expect(ingredients).toBeVisible();
  await expect(ingredients.getByRole('rowheader', { name: 'Milk' })).toBeVisible();

  const allergens = page.getByRole('table', { name: 'Possible intolerances: By category' });
  await expect(allergens.getByRole('rowheader', { name: 'Lactose' })).toBeVisible();

  await expect(page.getByRole('img', { name: 'Complaints per day' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Stool by Bristol type' })).toBeVisible();
});

test('updates when the settings change', async ({ page }) => {
  await choose(page, 'Time window after eating', '3 hours');
  await expect(page).toHaveURL(/window=3/);
  await choose(page, 'Complaint', 'Abnormal stool (Bristol 1-2 or 6-7)');
  await expect(page).toHaveURL(/outcome=stool/);
  await expect(page.getByRole('button', { name: /^Minimum severity/ })).toBeDisabled();

  await page.getByRole('button', { name: '7 days' }).click();
  await expect(page.getByRole('button', { name: '7 days' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('is reachable from the navigation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Analysis' }).click();
  await expect(page).toHaveURL(/\/analysis/);
});

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`accessibility (${scheme})`, () => {
    test.use({ colorScheme: scheme });

    test('analysis page has no serious violations', async ({ page }) => {
      await page.getByRole('table', { name: 'Possible intolerances: By ingredient' }).waitFor();
      await page.getByRole('img', { name: 'Complaints per day' }).waitFor();
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

test('compares days with poor sleep and high stress from demo data', async ({ page }) => {
  const table = page.getByRole('table', { name: 'Sleep and stress' });
  await expect(table).toBeVisible();
  await expect(table.getByRole('rowheader', { name: 'High stress' })).toBeVisible();
  await expect(table.getByRole('rowheader', { name: 'Short sleep' })).toBeVisible();
});
