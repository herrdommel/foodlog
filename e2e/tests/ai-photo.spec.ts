import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { loginViaApi, ORIGIN, registerVerified, setFeature } from './helpers.ts';

let email: string;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('foodlog.lang', 'en'));
  ({ email } = await registerVerified(page));
  await loginViaApi(page, email);
  await setFeature(page, email, 'ai_analysis', true);
  await setFeature(page, email, 'ai_photo', true);
});

async function configure(page: Page) {
  const headers = { origin: ORIGIN };
  await page.request.put('/api/ai/keys/anthropic', {
    data: { apiKey: 'mock-valid-key-1234' },
    headers,
  });
  await page.request.patch('/api/ai/settings', {
    data: { provider: 'anthropic', model: 'mock-large' },
    headers,
  });
}

async function samplePhoto(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#c98b3a';
    context.fillRect(0, 0, 640, 480);
    return canvas.toDataURL('image/png');
  });
  return Buffer.from(dataUrl.split(',')[1]!, 'base64');
}

async function openPhotoPanel(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Meal', exact: true }).click();
  await page.getByRole('button', { name: 'Recognise from a photo' }).click();
}

async function consent(page: Page) {
  await page.goto('/ai');
  const card = page.getByRole('region', { name: 'Consent for photos' });
  await card.getByRole('checkbox').click();
  await card.getByRole('button', { name: 'Give consent' }).click();
  await expect(card.getByText(/Consent given on/)).toBeVisible();
}

async function recognise(page: Page) {
  await openPhotoPanel(page);
  await page.getByLabel('Choose a photo').setInputFiles({
    name: 'meal.png',
    mimeType: 'image/png',
    buffer: await samplePhoto(page),
  });
  const panel = page.getByRole('region', { name: 'Recognise from a photo' });
  await expect(panel.getByRole('img', { name: 'Your photo' })).toBeVisible();
  await panel.getByRole('button', { name: 'Recognise ingredients' }).click();
  return panel;
}

test('is hidden while the photo flag is off', async ({ page }) => {
  await setFeature(page, email, 'ai_photo', false);
  await page.goto('/');
  await page.getByRole('button', { name: 'Meal', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Recognise from a photo' })).toHaveCount(0);
});

test('sends the user to the setup while key or consent are missing', async ({ page }) => {
  await openPhotoPanel(page);
  const panel = page.getByRole('region', { name: 'Recognise from a photo' });
  await expect(panel.getByText(/needs your AI provider/)).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Set it up' })).toHaveAttribute('href', '/ai');
  await expect(panel.getByLabel('Choose a photo')).toHaveCount(0);
});

test('recognises a photo and adds known and new ingredients to the meal', async ({ page }) => {
  await configure(page);
  await consent(page);
  const panel = await recognise(page);
  await expect(panel.getByText(/sent to Anthropic \(Claude\) \(mock-large\)/)).toBeVisible();
  await expect(panel.getByText(/analysed and not stored/)).toBeVisible();
  await expect(panel.getByText('Dragon fruit')).toBeVisible();
  await expect(panel.getByText('This is a guess by the AI')).toBeVisible();
  await panel.getByRole('button', { name: /^Add \d+ to the meal$/ }).click();

  await page.getByLabel('Title (optional)').fill('Photo lunch');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const card = page.getByRole('listitem').filter({ hasText: 'Photo lunch' });
  await expect(card).toContainText('Milk');
  await expect(card).toContainText('Rice');
  await expect(card).toContainText('Dragon fruit');
});

test('stops sending photos once the consent is withdrawn', async ({ page }) => {
  await configure(page);
  await consent(page);
  const card = page.getByRole('region', { name: 'Consent for photos' });
  await card.getByRole('button', { name: 'Withdraw consent' }).click();
  await expect(card.getByRole('checkbox')).toBeVisible();
  const response = await page.request.post('/api/ai/photo', {
    headers: { origin: ORIGIN },
    multipart: { file: { name: 'a.png', mimeType: 'image/png', buffer: await samplePhoto(page) } },
  });
  expect(response.status()).toBe(403);
  expect((await response.json()).error.code).toBe('photo_consent_required');
});

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`accessibility (${scheme})`, () => {
    test.use({ colorScheme: scheme });

    test('photo panel with suggestions and the consent card have no serious violations', async ({
      page,
    }) => {
      await configure(page);
      await consent(page);
      const serious = async () =>
        (await new AxeBuilder({ page }).analyze()).violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .flatMap((v) =>
            v.nodes.map((n) => `${v.id}: ${n.target.join(' ')} (${n.any[0]?.message ?? v.help})`),
          );
      expect(await serious()).toEqual([]);
      const panel = await recognise(page);
      await panel.getByText('This is a guess by the AI').waitFor();
      expect(await serious()).toEqual([]);
    });
  });
}
