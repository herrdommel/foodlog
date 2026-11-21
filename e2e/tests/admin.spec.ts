import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  loginViaApi,
  ORIGIN,
  PASSWORD,
  promoteToAdmin,
  registerVerified,
  uniqueEmail,
} from './helpers.ts';

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ baseURL: ORIGIN });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('foodlog.lang', 'en'));
  return page;
}

async function adminPage(browser: Browser) {
  const page = await newPage(browser);
  const { email } = await registerVerified(page, { name: 'Admin Person' });
  await promoteToAdmin(page, email);
  await loginViaApi(page, email);
  return { page, email };
}

async function userPage(browser: Browser, name = 'Regular Person') {
  const page = await newPage(browser);
  const { email } = await registerVerified(page, { name });
  await loginViaApi(page, email);
  return { page, email, name };
}

async function openUser(admin: Page, email: string) {
  await admin.goto('/admin/users');
  await admin.getByLabel('Search by name or email').fill(email);
  const links = admin.getByRole('link', { name: /^Open / });
  await expect(links).toHaveCount(1);
  await expect(admin.getByRole('table').getByText(email)).toBeVisible();
  await links.click();
  await admin.getByRole('region', { name: 'Profile data' }).waitFor();
}

test('only admins see the admin area', async ({ browser }) => {
  const { page: admin } = await adminPage(browser);
  await admin.goto('/');
  await expect(admin.getByRole('link', { name: 'Admin' })).toBeVisible();

  const { page: regular } = await userPage(browser);
  await regular.goto('/');
  await expect(regular.getByRole('link', { name: 'Admin' })).toHaveCount(0);
  await regular.goto('/admin/users');
  await expect(regular).toHaveURL(/\/$/);
  const response = await regular.request.get('/api/admin/users');
  expect(response.status()).toBe(403);
});

test('invites a new user who can register with the link', async ({ browser }) => {
  const { page: admin } = await adminPage(browser);
  await admin.goto('/admin/invites');
  await admin.getByRole('button', { name: 'Create invitation' }).click();
  const link = await admin.getByLabel('Invitation link (shown only now)').inputValue();
  expect(link).toContain('/register?invite=');

  const guest = await newPage(browser);
  await guest.goto(link);
  const email = uniqueEmail('invited');
  await guest.getByLabel('Name').fill('Invited Person');
  await guest.getByLabel('Email').fill(email);
  await guest.getByLabel('Password').fill(PASSWORD);
  await guest.getByRole('button', { name: 'Sign up' }).click();
  await expect(guest.getByText('Please check your inbox')).toBeVisible();

  await admin.reload();
  await expect(admin.getByText(/Used by /).first()).toBeVisible();
  await admin.goto('/admin/users');
  await admin.getByLabel('Search by name or email').fill(email);
  await expect(admin.getByRole('table').getByText(email)).toBeVisible();
  await expect(admin.getByText('Email unconfirmed')).toBeVisible();
});

test('revokes an open invitation', async ({ browser }) => {
  const { page: admin } = await adminPage(browser);
  await admin.goto('/admin/invites');
  await admin.getByLabel('Email address (optional)').fill('revoke-me@example.com');
  await admin.getByRole('button', { name: 'Create invitation' }).click();
  const link = await admin.getByLabel('Invitation link (shown only now)').inputValue();
  await admin.getByRole('button', { name: 'Revoke invitation revoke-me@example.com' }).click();
  await expect(
    admin.getByRole('button', { name: 'Revoke invitation revoke-me@example.com' }),
  ).toHaveCount(0);

  const guest = await newPage(browser);
  await guest.goto(link);
  await guest.getByLabel('Name').fill('Too Late');
  await guest.getByLabel('Email').fill('revoke-me@example.com');
  await guest.getByLabel('Password').fill(PASSWORD);
  await guest.getByRole('button', { name: 'Sign up' }).click();
  await expect(guest.getByRole('alert')).toHaveText('The invitation is invalid or has expired.');
});

test('deactivating a user signs them out and blocks the login', async ({ browser }) => {
  const { page: admin } = await adminPage(browser);
  const { page: regular, email } = await userPage(browser, 'Soon Disabled');
  await regular.goto('/');
  await expect(regular.getByRole('button', { name: 'Meal', exact: true })).toBeVisible();

  await openUser(admin, email);
  await admin.getByRole('button', { name: 'Deactivate account' }).click();
  await admin.getByRole('button', { name: 'Confirm' }).click();
  await expect(admin.getByRole('button', { name: 'Activate account' })).toBeVisible();

  await regular.reload();
  await expect(regular).toHaveURL(/\/login$/);
  await regular.getByLabel('Email').fill(email);
  await regular.getByLabel('Password').fill(PASSWORD);
  await regular.getByRole('button', { name: 'Sign in' }).click();
  await expect(regular.getByRole('alert')).toHaveText('This account is disabled.');

  await admin.getByRole('button', { name: 'Activate account' }).click();
  await expect(admin.getByRole('button', { name: 'Deactivate account' })).toBeVisible();
  await regular.getByRole('button', { name: 'Sign in' }).click();
  await expect(regular.getByRole('button', { name: 'Meal', exact: true })).toBeVisible();
});

test('changes name and email of a user', async ({ browser }) => {
  const { page: admin } = await adminPage(browser);
  const { email } = await userPage(browser, 'Old Name');
  await openUser(admin, email);
  const profile = admin.getByRole('region', { name: 'Profile data' });
  const newEmail = uniqueEmail('moved');
  await profile.getByLabel('Name').fill('New Name');
  await profile.getByLabel('Email').fill(newEmail);
  await profile.getByRole('button', { name: 'Save' }).click();
  await expect(admin.getByRole('heading', { name: 'New Name' })).toBeVisible();
  await expect(
    admin.getByRole('region', { name: 'Account' }).getByText('Email unconfirmed'),
  ).toBeVisible();
  await expect(profile.getByLabel('Email')).toHaveValue(newEmail);
});

test('a reset link lets the user choose a new password', async ({ browser }) => {
  const { page: admin } = await adminPage(browser);
  const { email } = await userPage(browser, 'Forgetful');
  await openUser(admin, email);
  await admin.getByRole('button', { name: 'Create link' }).click();
  const link = await admin.getByLabel('Link to hand over (shown only now)').inputValue();

  const guest = await newPage(browser);
  await guest.goto(link);
  await guest.getByLabel('New password').fill('a password set via admin');
  await guest.getByLabel('Repeat password').fill('a password set via admin');
  await guest.getByRole('button', { name: 'Save' }).click();
  await expect(guest.getByText('Your password has been changed')).toBeVisible();
  await guest.goto('/login');
  await guest.getByLabel('Email').fill(email);
  await guest.getByLabel('Password').fill('a password set via admin');
  await guest.getByRole('button', { name: 'Sign in' }).click();
  await expect(guest.getByRole('button', { name: 'Meal', exact: true })).toBeVisible();
});

test('public registration can be switched on and off', async ({ browser }) => {
  const { page: admin } = await adminPage(browser);
  const guest = await newPage(browser);
  const box = admin.getByRole('checkbox', { name: 'Allow public registration' });
  await guest.goto('/register');
  await expect(
    guest.getByText('Registration is only possible with an invitation link.'),
  ).toBeVisible();

  await admin.goto('/admin/settings');
  try {
    await box.click();
    await expect(box).toBeChecked();
    await guest.reload();
    await expect(guest.getByLabel('Name')).toBeVisible();
    await guest.goto('/login');
    await expect(guest.getByRole('link', { name: 'Sign up' })).toBeVisible();
  } finally {
    if (await box.isChecked()) await box.click();
  }
  await expect(box).not.toBeChecked();
  await guest.goto('/register');
  await expect(
    guest.getByText('Registration is only possible with an invitation link.'),
  ).toBeVisible();
});

test('feature overrides take effect for the user', async ({ browser }) => {
  const { page: admin } = await adminPage(browser);
  const { page: regular, email } = await userPage(browser, 'Feature User');
  await regular.goto('/analysis');
  await expect(regular.getByRole('link', { name: 'Export as CSV' })).toBeVisible();

  await openUser(admin, email);
  const features = admin.getByRole('region', { name: 'Features' });
  await features.getByLabel('Data export').selectOption('off');
  await expect(features.getByLabel('Data export')).toHaveValue('off');

  await regular.reload();
  await regular.getByRole('heading', { name: 'Analysis', exact: true }).waitFor();
  await expect(regular.getByRole('link', { name: 'Export as CSV' })).toHaveCount(0);

  await features.getByLabel('Data export').selectOption('default');
  await expect(features.getByLabel('Data export')).toHaveValue('default');
  await regular.reload();
  await expect(regular.getByRole('link', { name: 'Export as CSV' })).toBeVisible();
});

test('a global feature switch applies to everyone and is logged', async ({ browser }) => {
  const { page: admin } = await adminPage(browser);
  const { page: regular } = await userPage(browser);
  const enabled = admin.getByRole('checkbox', { name: 'Data export: Enabled' });

  await admin.goto('/admin/settings');
  try {
    await enabled.click();
    await expect(enabled).not.toBeChecked();
    await expect(
      admin.getByRole('checkbox', { name: 'Data export: Default for users' }),
    ).toBeDisabled();
    await expect(admin.getByText('Feature changed globally').first()).toBeVisible();

    await regular.goto('/analysis');
    await regular.getByRole('heading', { name: 'Analysis', exact: true }).waitFor();
    await expect(regular.getByRole('link', { name: 'Export as CSV' })).toHaveCount(0);
  } finally {
    if (!(await enabled.isChecked())) await enabled.click();
  }
  await expect(enabled).toBeChecked();
  await regular.reload();
  await expect(regular.getByRole('link', { name: 'Export as CSV' })).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`accessibility (${scheme})`, () => {
    test.use({ colorScheme: scheme });

    test('admin pages have no serious violations', async ({ browser }) => {
      const { page: admin } = await adminPage(browser);
      await admin.emulateMedia({ colorScheme: scheme });
      const { email } = await userPage(browser, 'Axe Subject');
      const check = async () => {
        const results = await new AxeBuilder({ page: admin }).analyze();
        return results.violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .flatMap((v) =>
            v.nodes.map((n) => `${v.id}: ${n.target.join(' ')} (${n.any[0]?.message ?? v.help})`),
          );
      };

      await admin.goto('/admin/users');
      await admin.getByRole('table', { name: 'User management' }).waitFor();
      expect(await check()).toEqual([]);

      await openUser(admin, email);
      await admin.getByRole('region', { name: 'Features' }).waitFor();
      expect(await check()).toEqual([]);

      await admin.goto('/admin/invites');
      await admin.getByRole('button', { name: 'Create invitation' }).click();
      await admin.getByLabel('Invitation link (shown only now)').waitFor();
      expect(await check()).toEqual([]);

      await admin.goto('/admin/settings');
      await admin.getByRole('checkbox', { name: 'Allow public registration' }).waitFor();
      expect(await check()).toEqual([]);
    });
  });
}
