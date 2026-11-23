import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import type { IngredientDto, ProductLookupDto } from '@foodlog/shared';
import { renderElement } from '../test/render.tsx';
import { server } from '../test/server.ts';
import { BarcodeLookup } from './BarcodeLookup.tsx';

const reader = vi.hoisted(() => ({ decodeFromConstraints: vi.fn(), decodeFromImageUrl: vi.fn() }));
vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatReader: class {
    constructor() {
      return reader;
    }
  },
}));
vi.mock('@zxing/library', () => ({
  BarcodeFormat: { EAN_13: 1, EAN_8: 2, UPC_A: 3, UPC_E: 4 },
  DecodeHintType: { POSSIBLE_FORMATS: 5 },
}));

const CODE = '2999999999779';
const milk: IngredientDto = {
  id: '11111111-1111-4111-8111-111111111111',
  nameDe: 'Milch',
  nameEn: 'Milk',
  custom: false,
  allergens: ['lactose', 'milk_protein'],
};
const product: ProductLookupDto = {
  barcode: CODE,
  name: 'Hazel spread',
  brand: 'Acme',
  suggestions: {
    matched: [milk],
    proposed: [
      { name: 'Palm oil', allergens: [], source: 'ingredient' },
      { name: 'Soy lecithin', allergens: ['soy'], source: 'ingredient' },
    ],
  },
};

function setup(onBusyChange?: (busy: boolean) => void) {
  const created: { name: string; allergens: string[] }[] = [];
  server.use(
    http.get(`/api/products/${CODE}`, () => HttpResponse.json(product)),
    http.post('/api/ingredients', async ({ request }) => {
      const body = (await request.json()) as { name: string; allergens: string[] };
      created.push(body);
      return HttpResponse.json({
        id: `new-${created.length}`,
        nameDe: body.name,
        nameEn: body.name,
        custom: true,
        allergens: body.allergens,
      });
    }),
  );
  const onAdd = vi.fn();
  renderElement(<BarcodeLookup onAdd={onAdd} onBusyChange={onBusyChange} />);
  return { created, onAdd };
}

async function lookUp(code = CODE) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Look up a barcode' }));
  await user.type(screen.getByLabelText('Barcode number'), code);
  await user.click(screen.getByRole('button', { name: 'Look up' }));
  return user;
}

describe('BarcodeLookup', () => {
  it('rejects an invalid number without asking the server', async () => {
    const asked = vi.fn();
    server.use(http.get('/api/products/:code', () => asked() ?? HttpResponse.json({})));
    renderElement(<BarcodeLookup onAdd={vi.fn()} />);
    await lookUp('2999999999770');
    expect(await screen.findByRole('alert')).toHaveTextContent('not a valid barcode');
    expect(asked).not.toHaveBeenCalled();
  });

  it('shows known and new ingredients and adds the checked ones', async () => {
    const { created, onAdd } = setup();
    const user = await lookUp();
    expect(await screen.findByText('Known ingredients')).toBeInTheDocument();
    expect(screen.getByText('Milk')).toBeInTheDocument();
    expect(screen.getByText('Palm oil')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Food Facts' })).toHaveAttribute(
      'href',
      `https://world.openfoodfacts.org/product/${CODE}`,
    );

    await user.click(screen.getByRole('checkbox', { name: /Palm oil/ }));
    await user.click(screen.getByRole('button', { name: 'Add 2 to the meal' }));

    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(created).toEqual([{ name: 'Soy lecithin', allergens: ['soy'] }]);
    const [ingredients, label] = onAdd.mock.calls[0]!;
    expect(ingredients.map((i: IngredientDto) => i.nameEn)).toEqual(['Milk', 'Soy lecithin']);
    expect(label).toBe('Acme Hazel spread');
  });

  it('reports that it is busy until the new ingredients are created and added', async () => {
    const events: string[] = [];
    const { onAdd } = setup((busy) => events.push(busy ? 'busy' : 'idle'));
    onAdd.mockImplementation(() => events.push('added'));
    const user = await lookUp();
    await screen.findByText('New ingredients');
    await user.click(screen.getByRole('button', { name: 'Add 3 to the meal' }));
    await waitFor(() => expect(events).toEqual(['busy', 'added', 'idle']));
  });

  it('removes the "no barcode in this photo" message once a number is typed', async () => {
    reader.decodeFromImageUrl.mockRejectedValue(new Error('no code'));
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Look up a barcode' }));
    await user.upload(
      screen.getByLabelText('Photo or file'),
      new File(['x'], 'code.png', { type: 'image/png' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('No barcode could be read');

    await user.type(screen.getByLabelText('Barcode number'), '2');
    expect(screen.queryByText(/No barcode could be read/)).not.toBeInTheDocument();
  });

  it('removes the photo message when a looked-up number replaces it', async () => {
    reader.decodeFromImageUrl.mockRejectedValue(new Error('no code'));
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Look up a barcode' }));
    await user.upload(
      screen.getByLabelText('Photo or file'),
      new File(['x'], 'code.png', { type: 'image/png' }),
    );
    await screen.findByText(/No barcode could be read/);
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    expect(screen.queryByText(/No barcode could be read/)).not.toBeInTheDocument();
  });

  it('creates nothing when only known ingredients are kept', async () => {
    const { created, onAdd } = setup();
    const user = await lookUp();
    await screen.findByText('New ingredients');
    await user.click(screen.getByRole('checkbox', { name: /Palm oil/ }));
    await user.click(screen.getByRole('checkbox', { name: /Soy lecithin/ }));
    await user.click(screen.getByRole('button', { name: 'Add 1 to the meal' }));
    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(created).toEqual([]);
  });

  it('explains an unknown product', async () => {
    server.use(
      http.get(`/api/products/${CODE}`, () =>
        HttpResponse.json({ error: { code: 'product_not_found', message: '' } }, { status: 404 }),
      ),
    );
    renderElement(<BarcodeLookup onAdd={vi.fn()} />);
    await lookUp();
    expect(await screen.findByRole('alert')).toHaveTextContent('No product was found');
  });
});
