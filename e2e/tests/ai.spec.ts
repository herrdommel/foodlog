import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { loginViaApi, registerVerified, seedDemoData, setFeature } from './helpers.ts';

let email: string;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('foodlog.lang', 'en'));
  ({ email } = await registerVerified(page));
  await seedDemoData(page, email);
  await loginViaApi(page, email);
});

test('is hidden while the feature is off', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Meal', exact: true }).waitFor();
  await expect(page.getByRole('link', { name: 'AI', exact: true })).toHaveCount(0);
  await page.goto('/ai');
  await expect(page).toHaveURL(/\/$/);
  expect((await page.request.get('/api/ai/settings')).status()).toBe(403);
});

test.describe('with the feature enabled', () => {
  test.beforeEach(async ({ page }) => {
    await setFeature(page, email, 'ai_analysis', true);
  });

  test('sets up a key, consents, previews the data and runs the analysis', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'AI', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'AI analysis', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start AI analysis' })).toBeDisabled();

    await page.getByLabel('API key').fill('mock-valid-key-1234');
    await page.getByRole('button', { name: 'Save key' }).click();
    await expect(page.getByText('Key stored (ends in 1234)')).toBeVisible();
    await expect(page.getByLabel('API key')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('mock-valid-key');

    await expect(page.getByLabel('Model')).toHaveValue('mock-large');
    await page.getByRole('button', { name: 'Save model' }).click();
    await expect(page.getByText('Model saved')).toBeVisible();

    const consent = page.getByRole('region', { name: 'Consent for the analysis' });
    await consent.getByRole('checkbox').check();
    await consent.getByRole('button', { name: 'Give consent' }).click();
    await expect(consent.getByText(/Consent given on/)).toBeVisible();

    await page.getByRole('button', { name: 'Show data to be sent' }).click();
    const preview = page.getByRole('region', { name: 'This data will be sent' });
    await expect(preview.getByText(/\d+ entries/)).toBeVisible();
    await preview.getByText('Data', { exact: true }).click();
    await expect(preview.locator('pre').last()).toContainText('"suspects"');
    await expect(preview.locator('pre').last()).not.toContainText('@example.com');

    await page.getByRole('button', { name: 'Start AI analysis' }).click();
    const result = page.getByRole('region', { name: 'Result' });
    await expect(result.getByText(/MOCK ANALYSIS \(mock-large\)/)).toBeVisible();
    await expect(result.getByText('Exactly the data shown was sent.')).toBeVisible();
    await expect(result.getByRole('note')).toContainText('not medical advice');
  });

  test('rejects an invalid key and keeps the form usable', async ({ page }) => {
    await page.goto('/ai');
    await page.getByLabel('API key').fill('mock-invalid');
    await page.getByRole('button', { name: 'Save key' }).click();
    await expect(page.getByRole('alert')).toHaveText('The provider rejected the API key.');
    await expect(page.getByLabel('API key')).toBeVisible();
    await expect(page.getByText(/Key stored/)).toHaveCount(0);
  });

  test('removes the key and withdraws consent', async ({ page }) => {
    await page.goto('/ai');
    await page.getByLabel('API key').fill('mock-valid-key-5678');
    await page.getByRole('button', { name: 'Save key' }).click();
    await expect(page.getByText('Key stored (ends in 5678)')).toBeVisible();

    const consent = page.getByRole('region', { name: 'Consent for the analysis' });
    await consent.getByRole('checkbox').check();
    await consent.getByRole('button', { name: 'Give consent' }).click();
    await consent.getByRole('button', { name: 'Withdraw consent' }).click();
    await expect(consent.getByRole('button', { name: 'Give consent' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start AI analysis' })).toBeDisabled();

    await page.getByRole('button', { name: 'Delete key' }).click();
    await expect(page.getByLabel('API key')).toBeVisible();
    const response = await page.request.get('/api/ai/settings');
    expect((await response.json()).keys.anthropic.configured).toBe(false);
  });

  test('is reachable from the analysis with the same settings', async ({ page }) => {
    await page.goto('/analysis?window=24');
    await page.getByRole('heading', { name: 'Analysis', exact: true }).waitFor();
    await page.getByRole('link', { name: 'AI analysis' }).click();
    await expect(page).toHaveURL(/\/ai\?.*window=24/);
    await expect(page.getByLabel('Time window after eating')).toHaveValue('24');
  });

  for (const scheme of ['light', 'dark'] as const) {
    test.describe(`accessibility (${scheme})`, () => {
      test.use({ colorScheme: scheme });

      test('AI page has no serious violations', async ({ page }) => {
        await page.goto('/ai');
        await page.getByLabel('API key').fill('mock-valid-key-9999');
        await page.getByRole('button', { name: 'Save key' }).click();
        await page.getByText('Key stored (ends in 9999)').waitFor();
        const consent = page.getByRole('region', { name: 'Consent for the analysis' });
        await consent.getByRole('checkbox').check();
        await consent.getByRole('button', { name: 'Give consent' }).click();
        await page.getByRole('button', { name: 'Save model' }).click();
        await page.getByRole('button', { name: 'Show data to be sent' }).click();
        await page.getByRole('region', { name: 'This data will be sent' }).waitFor();
        await page.getByRole('button', { name: 'Start AI analysis' }).click();
        await page.getByRole('region', { name: 'Result' }).waitFor();

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
});
