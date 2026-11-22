import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { loginViaApi, registerVerified } from './helpers.ts';

const CODE = '4000000000013';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('foodlog.lang', 'en'));
  const { email } = await registerVerified(page);
  await loginViaApi(page, email);
  await page.goto('/');
  await page.getByRole('button', { name: 'Meal', exact: true }).click();
});

async function lookUp(page: Page, code = CODE) {
  await page.getByRole('button', { name: 'Look up a barcode' }).click();
  await page.getByLabel('Barcode number').fill(code);
  await page.getByRole('button', { name: 'Look up', exact: true }).click();
}

test('adds a scanned product with known and new ingredients to a meal', async ({ page }) => {
  await lookUp(page);
  const panel = page.getByRole('region', { name: 'Look up a product' });
  await expect(panel.getByText('Known ingredients')).toBeVisible();
  await expect(panel.getByText('Soy lecithin')).toBeVisible();
  await panel.getByRole('checkbox', { name: /Palm oil/ }).click();
  await panel.getByRole('button', { name: /^Add \d+ to the meal$/ }).click();

  await expect(page.getByLabel('Title (optional)')).toHaveValue('Acme Hazel spread');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  const card = page.getByRole('listitem').filter({ hasText: 'Acme Hazel spread' });
  await expect(card).toContainText('Milk');
  await expect(card).toContainText('Soy lecithin');
  await expect(card).not.toContainText('Palm oil');
  await expect(card.getByText('Soy', { exact: true })).toBeVisible();
});

test('reuses the tags it created when the same product is looked up again', async ({ page }) => {
  await lookUp(page);
  await page.getByRole('button', { name: /^Add \d+ to the meal$/ }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Acme Hazel spread' })).toBeVisible();

  await page.getByRole('button', { name: 'Meal', exact: true }).click();
  await lookUp(page);
  const panel = page.getByRole('region', { name: 'Look up a product' });
  await expect(panel.getByText('Known ingredients')).toBeVisible();
  await expect(panel.getByText('New ingredients')).toHaveCount(0);
  await expect(panel.getByText('Palm oil')).toBeVisible();
});

test('explains unknown products and typos', async ({ page }) => {
  await lookUp(page, '4000000000020');
  await expect(page.getByText('No product was found for this barcode.')).toBeVisible();
  await page.getByLabel('Barcode number').fill('4000000000021');
  await page.getByRole('button', { name: 'Look up', exact: true }).click();
  await expect(page.getByText('This is not a valid barcode number')).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`accessibility (${scheme})`, () => {
    test.use({ colorScheme: scheme });

    test('barcode panel with a result has no serious violations', async ({ page }) => {
      await lookUp(page);
      await page.getByText('Known ingredients').waitFor();
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
