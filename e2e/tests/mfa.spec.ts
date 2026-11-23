import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { loginViaApi, PASSWORD, promoteToAdmin, registerVerified, signOut } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('foodlog.lang', 'en'));
});

async function totpNow(page: Page, secret: string, offset = 0) {
  const response = await page.request.get('http://127.0.0.1:3100/__test/totp-now', {
    params: { secret, offset: String(offset) },
  });
  return ((await response.json()) as { code: string }).code;
}

async function addVirtualAuthenticator(page: Page) {
  const client = await page.context().newCDPSession(page);
  await client.send('WebAuthn.enable');
  await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

test('sets up an authenticator app and needs its code at sign-in', async ({ page }) => {
  const { email } = await registerVerified(page);
  await loginViaApi(page, email);
  await page.goto('/profile');

  const card = page.getByRole('region', { name: 'Two-factor authentication' });
  await card.getByRole('button', { name: 'Set up authenticator app' }).click();
  await expect(card.getByRole('img', { name: 'QR code for the authenticator app' })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
  ).toEqual([]);

  const secret = (await card.locator('code').innerText()).trim();
  await card.getByLabel('Code from the app').fill(await totpNow(page, secret));
  await card.getByLabel('Password to confirm changes').fill(PASSWORD);
  await card.getByRole('button', { name: 'Confirm and activate' }).click();
  await expect(card.getByRole('heading', { name: 'Your recovery codes' })).toBeVisible();
  const recovery = (await card.getByRole('listitem').first().innerText()).trim();
  await card.getByRole('button', { name: 'I saved them' }).click();
  await expect(card.getByText('The authenticator app is active.')).toBeVisible();

  await signOut(page);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Second step' })).toBeVisible();

  await page.getByLabel('Code from your authenticator app').fill('000000');
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByRole('alert')).toContainText('The code is not correct.');

  await page.getByLabel('Code from your authenticator app').fill(await totpNow(page, secret, 30));
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByRole('button', { name: 'Meal', exact: true })).toBeVisible();

  await signOut(page);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Use a recovery code' }).click();
  await page.getByLabel('Recovery code').fill(recovery);
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByRole('button', { name: 'Meal', exact: true })).toBeVisible();
});

test('registers a passkey and signs in with it, with and without the password', async ({
  page,
}) => {
  await addVirtualAuthenticator(page);
  const { email } = await registerVerified(page);
  await loginViaApi(page, email);
  await page.goto('/profile');

  const card = page.getByRole('region', { name: 'Two-factor authentication' });
  await card.getByRole('button', { name: 'Add a passkey' }).click();
  await card.getByLabel('Passkey name').fill('Test laptop');
  await card.getByLabel('Password to confirm changes').fill(PASSWORD);
  await card.getByRole('button', { name: 'Create passkey' }).click();
  await expect(card.getByRole('heading', { name: 'Your recovery codes' })).toBeVisible();
  await card.getByRole('button', { name: 'I saved them' }).click();
  await expect(card.getByText('Test laptop')).toBeVisible();

  await signOut(page);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByRole('button', { name: 'Use a passkey instead' }).click();
  await expect(page.getByRole('button', { name: 'Meal', exact: true })).toBeVisible();

  await signOut(page);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Second step' })).toBeVisible();
  await page.getByRole('button', { name: 'Use a passkey' }).click();
  await expect(page.getByRole('button', { name: 'Meal', exact: true })).toBeVisible();
});

test('sends an administrator without a second factor to the profile with an explanation', async ({
  page,
}) => {
  const { email } = await registerVerified(page);
  await promoteToAdmin(page, email, false);
  await loginViaApi(page, email);
  await page.goto('/');
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('link', { name: 'Admin' }).click();

  await expect(page).toHaveURL(/\/profile$/);
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Second factor required');
  await expect(alert).toBeInViewport();
});
