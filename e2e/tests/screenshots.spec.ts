import { mkdirSync } from 'node:fs';
import { test, type Page } from '@playwright/test';
import { createInvite, loginViaApi, registerVerified } from './helpers.ts';

const OUT = 'screenshots';

const variants = [
  { name: 'desktop-light', viewport: { width: 1280, height: 800 }, scheme: 'light' as const },
  { name: 'mobile-dark', viewport: { width: 390, height: 844 }, scheme: 'dark' as const },
];

async function shot(page: Page, name: string) {
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

for (const variant of variants) {
  test.describe(variant.name, () => {
    test.use({ viewport: variant.viewport, colorScheme: variant.scheme });

    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem('foodlog.lang', 'en'));
    });

    test('public pages', async ({ page, request }) => {
      await page.goto('/login');
      await shot(page, `${variant.name}-login`);
      await page.goto(`/register?invite=${await createInvite(request)}`);
      await shot(page, `${variant.name}-register`);
      await page.goto('/forgot-password');
      await shot(page, `${variant.name}-forgot-password`);
    });

    test('signed-in pages', async ({ page }) => {
      const { email } = await registerVerified(page);
      await loginViaApi(page, email);
      await page.goto('/');
      await page.getByRole('heading', { name: /Hello/ }).waitFor();
      await shot(page, `${variant.name}-dashboard`);
      await page.goto('/profile');
      await page.getByRole('heading', { name: 'Profile' }).waitFor();
      await shot(page, `${variant.name}-profile`);
    });
  });
}

test.describe('german', () => {
  test.use({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' });

  test('login and profile', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('foodlog.lang', 'de'));
    await page.goto('/login');
    await shot(page, 'de-login');
    const { email } = await registerVerified(page, { locale: 'de' });
    await loginViaApi(page, email);
    await page.goto('/profile');
    await page.getByRole('heading', { name: 'Profil' }).waitFor();
    await shot(page, 'de-profile');
  });
});
