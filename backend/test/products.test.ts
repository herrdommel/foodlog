import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { featureFlags, ingredients } from '../src/db/schema.ts';
import { newId } from '../src/lib/crypto.ts';
import { createTestApp, get, post, registerAndLogin, type TestApp } from './helpers.ts';

const CODE = '3017620422003';

let t: TestApp;
let cookie: string;
let offResponse: () => Response;
const fetchStub = vi.fn<(url: URL | string, init?: RequestInit) => Promise<Response>>(async () =>
  offResponse(),
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function product(overrides: Record<string, unknown> = {}) {
  return json({
    status: 1,
    product: {
      product_name: 'Hazel spread',
      brands: 'Acme, Acme Foods',
      ingredients: [
        { id: 'en:sugar', text: 'sugar' },
        { id: 'en:palm-oil', text: 'palm oil' },
        { id: 'en:skimmed-milk', text: 'skimmed milk' },
        { id: 'en:soy-lecithin', text: 'soy lecithin' },
        { id: 'en:water', text: 'water' },
        { id: 'en:e322', text: 'lecithins' },
        { id: 'en:wheat-flour', text: 'wheat flour' },
      ],
      allergens_tags: ['en:milk', 'en:soybeans', 'en:gluten'],
      ...overrides,
    },
  });
}

async function lookup(code = CODE) {
  return get(t.app, `/api/products/${code}`, cookie);
}

beforeEach(async () => {
  await t?.close();
  fetchStub.mockClear();
  offResponse = () => product();
  t = await createTestApp({}, fetchStub as unknown as typeof fetch);
  cookie = await registerAndLogin(t);
});

afterAll(async () => {
  await t?.close();
});

describe('product lookup', () => {
  it('asks Open Food Facts for the product with an identifying user agent', async () => {
    await lookup();
    const [url, init] = fetchStub.mock.calls[0]!;
    expect(String(url)).toBe(
      'https://world.openfoodfacts.org/api/v2/product/3017620422003.json?fields=product_name%2Cbrands%2Cingredients%2Callergens_tags',
    );
    expect((init?.headers as Record<string, string>)['user-agent']).toContain('FoodlogIO');
  });

  it('takes known catalog entries and proposes the rest', async () => {
    const body = (await lookup()).json();
    expect(body).toMatchObject({ barcode: CODE, name: 'Hazel spread', brand: 'Acme' });
    const matched = body.suggestions.matched.map((i: { nameEn: string }) => i.nameEn).sort();
    expect(matched).toEqual(['Milk', 'Sugar']);
    const proposed = body.suggestions.proposed.map((p: { name: string }) => p.name);
    expect(proposed).toEqual(['Palm oil', 'Soy lecithin', 'Wheat flour']);
  });

  it('skips water, additives and taxonomy parents', async () => {
    const body = (await lookup()).json();
    const names = [
      ...body.suggestions.matched.map((i: { nameEn: string }) => i.nameEn),
      ...body.suggestions.proposed.map((p: { name: string }) => p.name),
    ];
    expect(names).not.toContain('Water');
    expect(names).not.toContain('Lecithins');
  });

  it('derives allergens of new tags from their own name', async () => {
    const { proposed } = (await lookup()).json().suggestions;
    const allergensOf = (name: string) =>
      proposed.find((p: { name: string }) => p.name === name).allergens;
    expect(allergensOf('Soy lecithin')).toEqual(['soy']);
    expect(allergensOf('Wheat flour')).toEqual(['gluten']);
    expect(allergensOf('Palm oil')).toEqual([]);
  });

  it('keeps allergens that the product declares but no ingredient explains', async () => {
    offResponse = () =>
      product({
        ingredients: [{ id: 'en:rice', text: 'rice' }],
        allergens_tags: ['en:sulphur-dioxide-and-sulphites', 'en:celery'],
      });
    const { proposed } = (await lookup()).json().suggestions;
    expect(proposed).toEqual([
      { name: 'Hazel spread', allergens: ['celery', 'sulfite'], source: 'product' },
    ]);
  });

  it('does not repeat allergens that matched entries already carry', async () => {
    offResponse = () =>
      product({
        ingredients: [{ id: 'en:milk', text: 'milk' }],
        allergens_tags: ['en:milk'],
      });
    expect((await lookup()).json().suggestions.proposed).toEqual([]);
  });

  it('reuses an own tag with the same name instead of proposing it again', async () => {
    const id = newId();
    const [user] = await t.db.query.users.findMany();
    await t.db
      .insert(ingredients)
      .values({ id, userId: user!.id, nameDe: 'Palm oil', nameEn: 'Palm oil' });
    const body = (await lookup()).json();
    expect(body.suggestions.matched.some((i: { id: string }) => i.id === id)).toBe(true);
    expect(body.suggestions.proposed.map((p: { name: string }) => p.name)).not.toContain(
      'Palm oil',
    );
  });

  it("ignores another user's tags", async () => {
    const other = await registerAndLogin(t, 'bob@example.com', 'Bob');
    await post(t.app, '/api/ingredients', { name: 'Palm oil' }, other);
    const body = (await lookup()).json();
    expect(body.suggestions.proposed.map((p: { name: string }) => p.name)).toContain('Palm oil');
  });

  it('caps the number of ingredients and ignores unusable names', async () => {
    offResponse = () =>
      product({
        ingredients: [
          ...Array.from({ length: 40 }, (_, i) => ({
            id: `en:thing-${i}`,
            text: `thing ${'x'.repeat(i % 3)}`,
          })),
          { id: 'en:odd', text: 'contains 12 % of <b>' },
        ],
        allergens_tags: [],
      });
    const { proposed } = (await lookup()).json().suggestions;
    expect(proposed.length).toBeLessThanOrEqual(25);
  });

  it('caches a product so a rescan does not hit the upstream again', async () => {
    await lookup();
    await lookup();
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });
});

describe('product lookup errors', () => {
  it('answers 404 for an unknown product, both ways Open Food Facts says so', async () => {
    offResponse = () => json({ status: 0, status_verbose: 'product not found' }, 200);
    expect((await lookup()).statusCode).toBe(404);
    offResponse = () => json({}, 404);
    const response = await lookup('96385074');
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('product_not_found');
  });

  it('answers 502 when Open Food Facts fails or cannot be reached', async () => {
    offResponse = () => json({}, 503);
    const failed = await lookup();
    expect(failed.statusCode).toBe(502);
    expect(failed.json().error.code).toBe('product_lookup_failed');
    fetchStub.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect((await lookup('96385074')).statusCode).toBe(502);
  });

  it('rejects barcodes that are not valid before any upstream request', async () => {
    for (const code of ['3017620422004', 'abc', '123']) {
      expect((await lookup(code)).statusCode).toBe(400);
    }
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('requires a session', async () => {
    expect((await get(t.app, `/api/products/${CODE}`)).statusCode).toBe(401);
  });

  it('is switched off by the feature flag', async () => {
    await t.db
      .insert(featureFlags)
      .values({ key: 'barcode_scan', enabled: false, defaultForUsers: true });
    const response = await lookup();
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('feature_disabled');
    expect(fetchStub).not.toHaveBeenCalled();
  });
});
