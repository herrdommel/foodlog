import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { loginViaApi, registerVerified } from './helpers.ts';

const CODE = '2999999999779';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('foodlog.lang', 'en'));
  const { email } = await registerVerified(page);
  await loginViaApi(page, email);
  await page.goto('/');
  await page.getByRole('button', { name: 'Meal', exact: true }).click();
});

async function lookUp(page: Page, code = CODE) {
  await page.getByRole('button', { name: 'Look up a barcode' }).click();
  await page.getByLabel('Barcode number').fill(code);
  await page.getByRole('button', { name: 'Look up', exact: true }).click();
}

test('adds a scanned product with known and new ingredients to a meal', async ({ page }) => {
  await lookUp(page);
  const panel = page.getByRole('region', { name: 'Look up a product' });
  await expect(panel.getByText('Known ingredients')).toBeVisible();
  await expect(panel.getByText('Soy lecithin')).toBeVisible();
  await panel.getByRole('checkbox', { name: /Palm oil/ }).click();
  await panel.getByRole('button', { name: /^Add \d+ to the meal$/ }).click();

  await expect(page.getByLabel('Title (optional)')).toHaveValue('Acme Hazel spread');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  const card = page.getByRole('listitem').filter({ hasText: 'Acme Hazel spread' });
  await expect(card).toContainText('Milk');
  await expect(card).toContainText('Soy lecithin');
  await expect(card).not.toContainText('Palm oil');
  await expect(card.getByText('Soy', { exact: true })).toBeVisible();
});

test('cannot be saved while the product is still being added', async ({ page }) => {
  await page.route('**/api/ingredients', async (route) => {
    if (route.request().method() === 'POST')
      await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await lookUp(page);
  const panel = page.getByRole('region', { name: 'Look up a product' });
  await expect(panel.getByText('Soy lecithin')).toBeVisible();
  await panel.getByRole('button', { name: /^Add \d+ to the meal$/ }).click();

  const save = page.getByRole('button', { name: 'Save', exact: true });
  await expect(save).toBeDisabled();
  await expect(page.getByLabel('Title (optional)')).toHaveValue('Acme Hazel spread');
  await expect(save).toBeEnabled();
});

// EAN-13 drawn in the browser, so the real decoder reads a real image.
async function barcodeImage(page: Page, code: string): Promise<Buffer> {
  const dataUrl = await page.evaluate((digits) => {
    const L = [
      '0001101',
      '0011001',
      '0010011',
      '0111101',
      '0100011',
      '0110001',
      '0101111',
      '0111011',
      '0110111',
      '0001011',
    ];
    const G = [
      '0100111',
      '0110011',
      '0011011',
      '0100001',
      '0011101',
      '0111001',
      '0000101',
      '0010001',
      '0001001',
      '0010111',
    ];
    const R = [
      '1110010',
      '1100110',
      '1101100',
      '1000010',
      '1011100',
      '1001110',
      '1010000',
      '1000100',
      '1001000',
      '1110100',
    ];
    const parity = [
      'LLLLLL',
      'LLGLGG',
      'LLGGLG',
      'LLGGGL',
      'LGLLGG',
      'LGGLLG',
      'LGGGLL',
      'LGLGLG',
      'LGLGGL',
      'LGGLGL',
    ];
    const d = [...digits].map(Number);
    let bits = '101';
    for (let i = 0; i < 6; i++) bits += (parity[d[0]!]![i] === 'L' ? L : G)[d[i + 1]!];
    bits += '01010';
    for (let i = 7; i < 13; i++) bits += R[d[i]!];
    bits += '101';
    const module = 3;
    const quiet = 30;
    const canvas = document.createElement('canvas');
    canvas.width = bits.length * module + quiet * 2;
    canvas.height = 140;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#000';
    [...bits].forEach((bit, index) => {
      if (bit === '1') context.fillRect(quiet + index * module, 20, module, 100);
    });
    return canvas.toDataURL('image/png');
  }, code);
  return Buffer.from(dataUrl.split(',')[1]!, 'base64');
}

test('reads a barcode from a photo and looks the product up', async ({ page }) => {
  await page.getByRole('button', { name: 'Look up a barcode' }).click();
  await page.getByLabel('Photo or file').setInputFiles({
    name: 'code.png',
    mimeType: 'image/png',
    buffer: await barcodeImage(page, CODE),
  });
  await expect(page.getByLabel('Barcode number')).toHaveValue(CODE);
  await expect(page.getByText('Known ingredients')).toBeVisible();
});

test('says so when a photo has no barcode', async ({ page }) => {
  await page.getByRole('button', { name: 'Look up a barcode' }).click();
  const blank = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 100;
    canvas.getContext('2d')!.fillRect(0, 0, 200, 100);
    return canvas.toDataURL('image/png');
  });
  await page.getByLabel('Photo or file').setInputFiles({
    name: 'blank.png',
    mimeType: 'image/png',
    buffer: Buffer.from(blank.split(',')[1]!, 'base64'),
  });
  await expect(page.getByText('No barcode could be read from this photo')).toBeVisible();
});

test('reuses the tags it created when the same product is looked up again', async ({ page }) => {
  await lookUp(page);
  await page.getByRole('button', { name: /^Add \d+ to the meal$/ }).click();
  await expect(page.getByLabel('Title (optional)')).toHaveValue('Acme Hazel spread');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Acme Hazel spread' })).toBeVisible();

  await page.getByRole('button', { name: 'Meal', exact: true }).click();
  await lookUp(page);
  const panel = page.getByRole('region', { name: 'Look up a product' });
  await expect(panel.getByText('Known ingredients')).toBeVisible();
  await expect(panel.getByText('New ingredients')).toHaveCount(0);
  await expect(panel.getByText('Palm oil')).toBeVisible();
});

test('explains unknown products and typos', async ({ page }) => {
  await lookUp(page, '2987654321775');
  await expect(page.getByText('No product was found for this barcode.')).toBeVisible();
  await page.getByLabel('Barcode number').fill('2987654321776');
  await page.getByRole('button', { name: 'Look up', exact: true }).click();
  await expect(page.getByText('This is not a valid barcode number')).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`accessibility (${scheme})`, () => {
    test.use({ colorScheme: scheme });

    test('barcode panel with a result has no serious violations', async ({ page }) => {
      await lookUp(page);
      await page.getByText('Known ingredients').waitFor();
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
