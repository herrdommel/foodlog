import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { loginViaApi, registerVerified, seedDemoData, setFeature } from './helpers.ts';

let email: string;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('foodlog.lang', 'en'));
  ({ email } = await registerVerified(page));
  await seedDemoData(page, email);
  await loginViaApi(page, email);
  await page.goto('/analysis');
  await page.getByRole('heading', { name: 'Analysis', exact: true }).waitFor();
});

test('downloads the entries as csv for the selected period', async ({ page }) => {
  await page.getByRole('button', { name: '7 days' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Export as CSV' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(
    /^foodlog-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/,
  );
  const path = await download.path();
  const content = readFileSync(path, 'utf8');
  expect(content.charCodeAt(0)).toBe(0xfeff);
  const lines = content.slice(1).trimEnd().split('\r\n');
  expect(lines[0]).toBe(
    'local_time,utc_time,type,title,ingredients,allergens,symptom_type,severity,bristol,note',
  );
  expect(lines.length).toBeGreaterThan(10);
  expect(content).toContain(',meal,');
  expect(content).toContain(',stool,');
});

test('opens a printable report and produces a pdf', async ({ page }) => {
  await page.getByRole('link', { name: 'Report for your doctor' }).click();
  await expect(page.getByRole('heading', { name: 'Foodlog report', level: 1 })).toBeVisible();
  await expect(page.getByText('Prepared for Anna Beispiel')).toBeVisible();
  await expect(page.getByRole('note')).toContainText('not a diagnosis');
  await expect(
    page.getByRole('table', { name: 'Possible intolerances: By category' }),
  ).toBeVisible();
  await page.getByRole('img', { name: 'Complaints per day' }).waitFor();

  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('navigation')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Print or save as PDF' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Foodlog report', level: 1 })).toBeVisible();

  mkdirSync('screenshots', { recursive: true });
  await page.pdf({ path: 'screenshots/report.pdf', format: 'A4', printBackground: true });
  expect(statSync('screenshots/report.pdf').size).toBeGreaterThan(20_000);
});

test('hides export and rejects the download when the feature is off', async ({ page }) => {
  await setFeature(page, email, 'data_export', false);
  await page.reload();
  await page.getByRole('heading', { name: 'Analysis', exact: true }).waitFor();
  await expect(page.getByRole('link', { name: 'Export as CSV' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Report for your doctor' })).toHaveCount(0);

  const response = await page.request.get('/api/export/entries.csv?from=2026-01-01&to=2026-01-31');
  expect(response.status()).toBe(403);
  expect((await response.json()).error.code).toBe('feature_disabled');
});

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`accessibility (${scheme})`, () => {
    test.use({ colorScheme: scheme });

    test('report page has no serious violations', async ({ page }) => {
      await page.getByRole('link', { name: 'Report for your doctor' }).click();
      await page.getByRole('heading', { name: 'Foodlog report', level: 1 }).waitFor();
      await page.getByRole('table', { name: 'Possible intolerances: By category' }).waitFor();
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
