import { mkdirSync } from 'node:fs';
import { test, type Page } from '@playwright/test';
import { createInvite, loginViaApi, ORIGIN, registerVerified } from './helpers.ts';

const OUT = 'screenshots';

const variants = [
  { name: 'desktop-light', viewport: { width: 1280, height: 800 }, scheme: 'light' as const },
  { name: 'mobile-dark', viewport: { width: 390, height: 844 }, scheme: 'dark' as const },
];

async function seedEntries(page: Page) {
  const find = async (q: string) =>
    (
      (await (await page.request.get(`/api/ingredients?q=${q}&limit=1`)).json()) as { id: string }[]
    )[0]!.id;
  const now = new Date();
  const wall = (hours: number) => {
    const date = new Date(now.getTime() - hours * 3_600_000);
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Berlin',
      dateStyle: 'short',
      timeStyle: 'short',
    })
      .format(date)
      .replace(' ', 'T');
  };
  const post = (data: object) =>
    page.request.post('/api/entries', { headers: { origin: ORIGIN }, data });
  await post({
    type: 'meal',
    occurredAt: wall(6),
    title: 'Porridge',
    ingredientIds: [await find('oats'), await find('milk'), await find('banana')],
    note: 'with a little honey',
  });
  await post({
    type: 'drink',
    occurredAt: wall(5),
    title: 'Coffee',
    ingredientIds: [await find('coffee')],
  });
  await post({ type: 'symptom', occurredAt: wall(3), symptomType: 'bloating', severity: 6 });
  await post({ type: 'stool', occurredAt: wall(2), bristol: 5 });
  await post({ type: 'medication', occurredAt: wall(1), title: 'Ibuprofen 400' });
}

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
      await seedEntries(page);
      await page.goto('/');
      await page.getByRole('button', { name: /^(Meal|Mahlzeit)$/ }).waitFor();
      await page.getByRole('listitem').first().waitFor();
      await shot(page, `${variant.name}-dashboard`);
      await page.getByRole('button', { name: 'Meal', exact: true }).click();
      await page.getByLabel('Ingredients').fill('mil');
      await page.getByRole('button', { name: /^Milk/ }).first().waitFor();
      await shot(page, `${variant.name}-meal-form`);
      await page.getByRole('button', { name: 'Cancel' }).click();
      await page.getByRole('button', { name: 'Stool', exact: true }).click();
      await shot(page, `${variant.name}-stool-form`);
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
