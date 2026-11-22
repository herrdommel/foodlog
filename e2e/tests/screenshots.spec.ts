import { mkdirSync } from 'node:fs';
import { test, type Page } from '@playwright/test';
import {
  createInvite,
  loginViaApi,
  ORIGIN,
  promoteToAdmin,
  registerVerified,
  seedDemoData,
} from './helpers.ts';

const OUT = 'screenshots';

const variants = [
  { name: 'desktop-light', viewport: { width: 1280, height: 800 }, scheme: 'light' as const },
  { name: 'mobile-dark', viewport: { width: 390, height: 844 }, scheme: 'dark' as const },
];

function yesterday() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(
    new Date(Date.now() - 24 * 3_600_000),
  );
}

async function seedEntries(page: Page) {
  const find = async (q: string) =>
    (
      (await (await page.request.get(`/api/ingredients?q=${q}&limit=1`)).json()) as { id: string }[]
    )[0]!.id;
  const day = yesterday();
  const wall = (time: string) => `${day}T${time}`;
  const post = (data: object) =>
    page.request.post('/api/entries', { headers: { origin: ORIGIN }, data });
  await post({
    type: 'meal',
    occurredAt: wall('08:10'),
    title: 'Porridge',
    ingredientIds: [await find('oats'), await find('milk'), await find('banana')],
    note: 'with a little honey',
  });
  await post({
    type: 'drink',
    occurredAt: wall('09:15'),
    title: 'Coffee',
    ingredientIds: [await find('coffee')],
  });
  await post({ type: 'symptom', occurredAt: wall('11:30'), symptomType: 'bloating', severity: 6 });
  await post({ type: 'stool', occurredAt: wall('12:45'), bristol: 5 });
  await post({ type: 'medication', occurredAt: wall('14:00'), title: 'Ibuprofen 400' });
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
      await page.goto('/');
      await page.getByRole('heading', { name: 'How it works' }).waitFor();
      await shot(page, `${variant.name}-start`);
      await page.goto('/login');
      await shot(page, `${variant.name}-login`);
      await page.goto(`/register?invite=${await createInvite(request)}`);
      await shot(page, `${variant.name}-register`);
      await page.goto('/forgot-password');
      await shot(page, `${variant.name}-forgot-password`);
      await page.goto('/privacy');
      await page.getByRole('article').waitFor();
      await shot(page, `${variant.name}-privacy`);
    });

    test('signed-in pages', async ({ page }) => {
      const { email } = await registerVerified(page);
      await loginViaApi(page, email);
      await seedEntries(page);
      await page.goto(`/?date=${yesterday()}`);
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
      await page.goto('/ingredients');
      await page.getByRole('heading', { name: 'Ingredients', exact: true }).waitFor();
      await shot(page, `${variant.name}-ingredients`);
      await seedDemoData(page, email);
      await page.goto('/analysis');
      await page.getByRole('table', { name: 'Possible intolerances: By ingredient' }).waitFor();
      await page.getByRole('img', { name: 'Complaints per day' }).waitFor();
      await shot(page, `${variant.name}-analysis`);
      await page.getByRole('link', { name: 'Report for your doctor' }).click();
      await page.getByRole('table', { name: 'Possible intolerances: By category' }).waitFor();
      await page.getByRole('img', { name: 'Complaints per day' }).waitFor();
      await page.emulateMedia({ media: 'print' });
      await shot(page, `${variant.name}-report-print`);
      await page.emulateMedia({ media: 'screen', colorScheme: variant.scheme });

      await promoteToAdmin(page, email);
      await page.goto('/admin/users');
      await page.getByRole('table', { name: 'User management' }).waitFor();
      await shot(page, `${variant.name}-admin-users`);
      await page
        .getByRole('link', { name: /^Open / })
        .first()
        .click();
      await page.getByRole('region', { name: 'Features' }).waitFor();
      await shot(page, `${variant.name}-admin-user`);
      await page.goto('/admin/invites');
      await page.getByRole('button', { name: 'Create invitation' }).click();
      await page.getByLabel('Invitation link (shown only now)').waitFor();
      await shot(page, `${variant.name}-admin-invites`);
      await page.goto('/admin/settings');
      await page.getByRole('checkbox', { name: 'Allow public registration' }).waitFor();
      await shot(page, `${variant.name}-admin-settings`);
    });
  });
}

test.describe('landing page images', () => {
  test.use({ viewport: { width: 900, height: 1100 }, colorScheme: 'light' });

  for (const lang of ['en', 'de'] as const) {
    test(`images ${lang}`, async ({ page }) => {
      await page.addInitScript((value) => localStorage.setItem('foodlog.lang', value), lang);
      const { email } = await registerVerified(page, { locale: lang });
      await loginViaApi(page, email);
      await seedDemoData(page, email);
      const out = '../frontend/public/landing';
      mkdirSync(out, { recursive: true });
      const capture = async (name: string) => {
        await page.waitForLoadState('networkidle');
        await page.screenshot({ path: `${out}/${name}-${lang}.jpg`, type: 'jpeg', quality: 82 });
      };
      await page.goto(`/?date=${yesterday()}`);
      await page.getByRole('listitem').first().waitFor();
      await capture('dashboard');
      await page.goto('/analysis');
      await page.getByRole('img').first().waitFor();
      await page.getByRole('table').first().waitFor();
      await capture('analysis');
      await page.goto('/report');
      await page.getByRole('table').first().waitFor();
      await page.getByRole('img').first().waitFor();
      await capture('report');
    });
  }
});

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
