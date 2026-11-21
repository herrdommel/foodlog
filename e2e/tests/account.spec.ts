import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  createInvite,
  loginViaApi,
  makeOnlyAdmin,
  ORIGIN,
  PASSWORD,
  registerVerified,
  seedDemoData,
  setFeature,
  uniqueEmail,
} from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('foodlog.lang', 'en'));
});

test('registration needs the privacy consent and links to the policy', async ({
  page,
  request,
}) => {
  const invite = await createInvite(request);
  await page.goto(`/register?invite=${invite}`);
  await page.getByLabel('Name').fill('Consent Person');
  await page.getByLabel('Email').fill(uniqueEmail('consent'));
  await page.getByLabel('Password').fill(PASSWORD);
  await expect(page.getByRole('button', { name: 'Sign up' })).toBeDisabled();

  const popup = page.waitForEvent('popup');
  await page.locator('label').getByRole('link', { name: 'privacy policy' }).click();
  const policy = await popup;
  await expect(policy.getByRole('heading', { name: 'Privacy policy' })).toBeVisible();
  await expect(policy.getByText('test privacy policy of the E2E fixture')).toBeVisible();

  await page.getByRole('checkbox', { name: /privacy policy/ }).check();
  await expect(page.getByRole('button', { name: 'Sign up' })).toBeEnabled();
});

test('the API refuses a registration without consent', async ({ page, request }) => {
  const invite = await createInvite(request);
  const response = await page.request.post('/api/auth/register', {
    headers: { origin: ORIGIN },
    data: {
      name: 'No Consent',
      email: uniqueEmail('noconsent'),
      password: PASSWORD,
      inviteToken: invite,
    },
  });
  expect(response.status()).toBe(400);
});

test.describe('legal pages', () => {
  test('are public, in both languages and linked from every page', async ({ page }) => {
    await page.goto('/login');
    await page
      .getByRole('navigation', { name: 'Legal' })
      .getByRole('link', { name: 'Imprint' })
      .click();
    await expect(page).toHaveURL(/\/imprint$/);
    await expect(page.getByText('Operator Example, Example Street 1')).toBeVisible();
    await expect(page.getByRole('link', { name: 'mail' })).toHaveAttribute(
      'href',
      'mailto:operator@example.com',
    );

    await page.getByLabel('Language').selectOption('de');
    await expect(page.getByText('Betreiber Muster, Musterstraße 1')).toBeVisible();
    await page.getByRole('link', { name: 'Datenschutzerklärung' }).click();
    await expect(page.getByText('Dies ist die Test-Datenschutzerklärung.')).toBeVisible();
  });

  test('are linked in the app after signing in', async ({ page }) => {
    const { email } = await registerVerified(page);
    await loginViaApi(page, email);
    await page.goto('/');
    await page.getByRole('button', { name: 'Meal', exact: true }).waitFor();
    await page
      .getByRole('navigation', { name: 'Legal' })
      .getByRole('link', { name: 'Privacy policy' })
      .click();
    await expect(page.getByText('how long we keep it')).toBeVisible();
  });

  for (const scheme of ['light', 'dark'] as const) {
    test.describe(`accessibility (${scheme})`, () => {
      test.use({ colorScheme: scheme });

      test('legal pages have no serious violations', async ({ page }) => {
        for (const path of ['/privacy', '/imprint']) {
          await page.goto(path);
          await page.getByRole('article').waitFor();
          const results = await new AxeBuilder({ page }).analyze();
          const serious = results.violations
            .filter((v) => v.impact === 'serious' || v.impact === 'critical')
            .flatMap((v) =>
              v.nodes.map((n) => `${v.id}: ${n.target.join(' ')} (${n.any[0]?.message ?? v.help})`),
            );
          expect(serious, path).toEqual([]);
        }
      });
    });
  }
});

test('downloads all personal data as JSON, even when the CSV export is switched off', async ({
  page,
}) => {
  const { email } = await registerVerified(page);
  await seedDemoData(page, email);
  await loginViaApi(page, email);
  await setFeature(page, email, 'data_export', false);
  await page.goto('/profile');
  await page.getByRole('heading', { name: 'Profile' }).waitFor();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download data as JSON' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^foodlog-export-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  expect(data.profile.email).toBe(email);
  expect(data.entries.length).toBeGreaterThan(100);
  expect(JSON.stringify(data)).not.toContain('argon2');
});

test('deletes the account with all data after confirmation', async ({ page, browser }) => {
  const { email } = await registerVerified(page, { name: 'To Be Deleted' });
  await seedDemoData(page, email);
  await loginViaApi(page, email);
  await page.goto('/profile');

  const card = page.getByRole('region', { name: 'Delete account' });
  await card.getByRole('button', { name: 'Delete account …' }).click();
  await card.getByLabel('Enter your email address to confirm').fill('someone-else@example.com');
  await card.getByLabel('Password').fill(PASSWORD);
  await card.getByRole('button', { name: 'Delete account permanently' }).click();
  await expect(card.getByRole('alert')).toHaveText(
    'The email address does not match your account.',
  );

  await card.getByLabel('Enter your email address to confirm').fill(email);
  await card.getByLabel('Password').fill('wrong password!');
  await card.getByRole('button', { name: 'Delete account permanently' }).click();
  await expect(card.getByRole('alert')).toHaveText('The password is incorrect.');

  await card.getByLabel('Password').fill(PASSWORD);
  await card.getByRole('button', { name: 'Delete account permanently' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');

  const other = await browser.newContext({ baseURL: ORIGIN });
  const otherPage = await other.newPage();
  const retry = await otherPage.request.post('/api/auth/register', {
    headers: { origin: ORIGIN },
    data: {
      name: 'Again',
      email,
      password: PASSWORD,
      inviteToken: await createInvite(otherPage.request),
      acceptPrivacy: true,
    },
  });
  expect(retry.status()).toBe(202);
});

test('the last administrator cannot delete the account', async ({ page }) => {
  const { email } = await registerVerified(page, { name: 'Only Admin' });
  await makeOnlyAdmin(page, email);
  await loginViaApi(page, email);
  await page.goto('/profile');
  const card = page.getByRole('region', { name: 'Delete account' });
  await card.getByRole('button', { name: 'Delete account …' }).click();
  await card.getByLabel('Enter your email address to confirm').fill(email);
  await card.getByLabel('Password').fill(PASSWORD);
  await card.getByRole('button', { name: 'Delete account permanently' }).click();
  await expect(card.getByRole('alert')).toContainText('last administrator');
  await expect(page).toHaveURL(/\/profile$/);
});
