import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  createInvite,
  latestMailLink,
  loginViaApi,
  PASSWORD,
  registerVerified,
  uniqueEmail,
} from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('foodlog.lang', 'en'));
});

async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  const messages = serious.flatMap((v) =>
    v.nodes.map((node) => `${v.id}: ${node.target.join(' ')} (${node.any[0]?.message ?? v.help})`),
  );
  expect(messages).toEqual([]);
}

test('registers with an invitation, confirms the email and signs in', async ({ page, request }) => {
  const email = uniqueEmail('register');
  const invite = await createInvite(request);

  await page.goto(`/register?invite=${invite}`);
  await page.getByLabel('Name').fill('Anna Beispiel');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('checkbox', { name: /privacy policy/ }).check();
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page.getByText('Please check your inbox')).toBeVisible();

  await page.goto(await latestMailLink(request, email, '/verify-email'));
  await expect(page.getByText('Your email address is confirmed')).toBeVisible();

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Meal', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('registration page requires an invitation when public registration is off', async ({
  page,
}) => {
  await page.goto('/register');
  await expect(
    page.getByText('Registration is only possible with an invitation link.'),
  ).toBeVisible();
});

test('resets a forgotten password', async ({ page, request }) => {
  const { email } = await registerVerified(page);
  await page.context().clearCookies();

  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send link' }).click();
  await expect(page.getByText('If an account exists')).toBeVisible();

  await page.goto(await latestMailLink(request, email, '/reset-password'));
  await page.getByLabel('New password').fill('a brand new password');
  await page.getByLabel('Repeat password').fill('a brand new password');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Your password has been changed')).toBeVisible();

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a brand new password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Meal', exact: true })).toBeVisible();
});

test('changes profile, avatar and email address', async ({ page, request }) => {
  const { email } = await registerVerified(page);
  await loginViaApi(page, email);

  await page.goto('/profile');
  await page.getByLabel('Name', { exact: true }).fill('Anna B.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved')).toBeVisible();

  await page.getByRole('button', { name: 'Choose avatar 7' }).click();
  await expect(page.getByRole('button', { name: 'Choose avatar 7' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  const newEmail = uniqueEmail('changed');
  await page.getByLabel('New email address').fill(newEmail);
  await page.getByLabel('Current password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Request change' }).click();
  await expect(page.getByText('We sent a confirmation link')).toBeVisible();

  await page.goto(await latestMailLink(request, newEmail, '/confirm-email'));
  await expect(page.getByText('Your new email address is confirmed.')).toBeVisible();

  await page.goto('/profile');
  await expect(page.getByText(newEmail)).toBeVisible();
});

test('redirects guests to the login page', async ({ page }) => {
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/login$/);
});

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`accessibility (${scheme})`, () => {
    test.use({ colorScheme: scheme });

    for (const path of ['/login', '/forgot-password']) {
      test(`${path} has no serious violations`, async ({ page }) => {
        await page.goto(path);
        await page.getByRole('heading').first().waitFor();
        await expectNoSeriousA11yViolations(page);
      });
    }

    test('register and profile have no serious violations', async ({ page, request }) => {
      await page.goto(`/register?invite=${await createInvite(request)}`);
      await page.getByLabel('Name').waitFor();
      await expectNoSeriousA11yViolations(page);

      const { email } = await registerVerified(page);
      await loginViaApi(page, email);
      await page.goto('/profile');
      await page.getByRole('heading', { name: 'Profile' }).waitFor();
      await expectNoSeriousA11yViolations(page);
    });
  });
}
