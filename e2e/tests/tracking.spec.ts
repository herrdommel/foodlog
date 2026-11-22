import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { loginViaApi, registerVerified } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('foodlog.lang', 'en'));
  const { email } = await registerVerified(page);
  await loginViaApi(page, email);
  await page.goto('/');
  await page.getByRole('button', { name: 'Meal', exact: true }).waitFor();
});

async function addIngredient(page: Page, query: string, optionName: RegExp) {
  await page.getByLabel('Ingredients').fill(query);
  await page.getByRole('button', { name: optionName }).first().click();
}

test('logs a meal with catalog ingredients and shows allergens', async ({ page }) => {
  await page.getByRole('button', { name: 'Meal', exact: true }).click();
  await page.getByLabel('Title (optional)').fill('Porridge');
  await addIngredient(page, 'milk', /^Milk/);
  await addIngredient(page, 'oats', /^Oats/);
  await page.getByLabel('Note').fill('with honey');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  const card = page.getByRole('listitem').filter({ hasText: 'Porridge' });
  await expect(card).toBeVisible();
  await expect(card.getByText('Milk, Oats')).toBeVisible();
  await expect(card.getByText('Lactose')).toBeVisible();
  await expect(card.getByText('Gluten')).toBeVisible();
  await expect(card.getByText('with honey')).toBeVisible();
});

test('logs sleep and stress', async ({ page }) => {
  await page.getByRole('button', { name: 'Sleep', exact: true }).click();
  await page.getByLabel('Sleep duration (hours)').fill('6.5');
  await page.getByRole('radio', { name: /^4: good/ }).check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('6 h 30 min')).toBeVisible();
  await expect(page.getByText('good', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Stress', exact: true }).click();
  await page.getByRole('radio', { name: /^5: very stressed/ }).check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Level 5 of 5')).toBeVisible();
});

test('logs a symptom, a stool entry and medication', async ({ page }) => {
  await page.getByRole('button', { name: 'Symptom', exact: true }).click();
  await page.getByLabel('Type of symptom').selectOption('bloating');
  await page.getByLabel('Severity').fill('7');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('7 out of 10')).toBeVisible();

  await page.getByRole('button', { name: 'Stool', exact: true }).click();
  await page.getByRole('radio', { name: /Type 5/ }).check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Type 5')).toBeVisible();

  await page.getByRole('button', { name: 'Medication', exact: true }).click();
  await page.getByLabel('Medication name').fill('Ibuprofen 400');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Ibuprofen 400')).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(3);
});

test('edits and deletes an entry', async ({ page }) => {
  await page.getByRole('button', { name: 'Stool', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Type 4', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('radio', { name: /Type 2/ }).check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Type 2', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('listitem').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('There are no entries for this day yet.')).toBeVisible();
});

test('brings the form into view when editing a far down entry on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 640 });
  for (let index = 0; index < 8; index += 1) {
    await page.getByRole('button', { name: 'Stool', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('listitem')).toHaveCount(index + 1);
  }
  const lastEdit = page.getByRole('button', { name: 'Edit' }).last();
  await lastEdit.scrollIntoViewIfNeeded();
  await lastEdit.click();
  const form = page.getByRole('form', { name: 'Add entry' });
  await expect
    .poll(() => form.evaluate((element) => element.getBoundingClientRect().top))
    .toBeGreaterThanOrEqual(0);
  await expect
    .poll(() => form.evaluate((element) => element.getBoundingClientRect().top))
    .toBeLessThan(200);
});

test('creates a custom ingredient and reuses a template', async ({ page }) => {
  await page.getByRole('button', { name: 'Meal', exact: true }).click();
  await page.getByLabel('Title (optional)').fill('Grandma soup');
  await page.getByLabel('Ingredients').fill('Grandma special');
  await page.getByRole('button', { name: 'Create “Grandma special”' }).click();
  await page.getByRole('checkbox', { name: 'Celery' }).check();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove Grandma special' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Save as template' }).check();
  await page.getByLabel('Template name').fill('Soup day');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Grandma soup' })).toBeVisible();

  await page.getByRole('button', { name: 'Meal', exact: true }).click();
  await page.getByRole('button', { name: 'Use template Soup day' }).click();
  await expect(page.getByLabel('Title (optional)')).toHaveValue('Grandma soup');
  await expect(page.getByRole('button', { name: 'Remove Grandma special' })).toBeVisible();
});

test('navigates to previous days', async ({ page }) => {
  await page.getByRole('button', { name: 'Stool', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('listitem')).toHaveCount(1);

  await page.getByRole('button', { name: 'Previous day' }).click();
  await expect(page).toHaveURL(/date=\d{4}-\d{2}-\d{2}/);
  await expect(page.getByText('There are no entries for this day yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Today' }).click();
  await expect(page.getByRole('listitem')).toHaveCount(1);
});

test('rejects entries in the future', async ({ page }) => {
  await page.getByRole('button', { name: 'Stool', exact: true }).click();
  await page.getByLabel('Time').fill('2099-01-01T08:00');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Entries in the future are not possible.');
});

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`accessibility (${scheme})`, () => {
    test.use({ colorScheme: scheme });

    test('dashboard with open meal form has no serious violations', async ({ page }) => {
      await page.getByRole('button', { name: 'Meal', exact: true }).click();
      await page.getByLabel('Ingredients').fill('milk');
      await page.getByRole('button', { name: /^Milk/ }).first().waitFor();
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
