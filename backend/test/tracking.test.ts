import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { IngredientDto } from '@foodlog/shared';
import {
  createTestApp,
  get,
  ORIGIN,
  patch,
  post,
  registerAndLogin,
  type TestApp,
} from './helpers.ts';

let t: TestApp;
let cookie: string;

beforeEach(async () => {
  await t?.close();
  t = await createTestApp();
  cookie = await registerAndLogin(t);
});

afterAll(async () => {
  await t?.close();
});

function send(method: 'PUT' | 'DELETE', url: string, payload?: unknown, as = cookie) {
  return t.app.inject({
    method,
    url,
    payload: payload as object | undefined,
    headers: { origin: ORIGIN, cookie: as },
  });
}

async function search(q: string, as = cookie): Promise<IngredientDto[]> {
  return (await get(t.app, `/api/ingredients?q=${encodeURIComponent(q)}`, as)).json();
}

async function ingredientId(q: string): Promise<string> {
  const found = await search(q);
  return found[0]!.id;
}

describe('authentication', () => {
  it('protects all tracking endpoints', async () => {
    expect((await get(t.app, '/api/ingredients')).statusCode).toBe(401);
    expect((await get(t.app, '/api/entries?date=2026-01-10')).statusCode).toBe(401);
    expect((await get(t.app, '/api/templates')).statusCode).toBe(401);
  });
});

describe('ingredient catalog', () => {
  it('finds catalog entries by German and English name with allergens', async () => {
    const german = await search('milch');
    expect(german.map((i) => i.nameDe)).toContain('Milch');
    expect(german.find((i) => i.nameDe === 'Milch')).toMatchObject({
      nameEn: 'Milk',
      custom: false,
      allergens: ['lactose', 'milk_protein'],
    });
    expect((await search('yogurt')).map((i) => i.nameDe)).toContain('Joghurt');
  });

  it('ranks prefix matches first', async () => {
    const results = await search('ei');
    expect(
      results[0]?.nameDe.toLowerCase().startsWith('ei') ||
        results[0]?.nameEn.toLowerCase().startsWith('ei'),
    ).toBe(true);
  });

  it('treats wildcard characters literally', async () => {
    expect(await search('%')).toEqual([]);
    expect(await search('_')).toEqual([]);
  });

  it('can be restricted to the catalog', async () => {
    await post(t.app, '/api/ingredients', { name: 'Milchreis Oma' }, cookie);
    const all = await search('milch');
    const catalog = (await get(t.app, '/api/ingredients?q=milch&scope=catalog', cookie)).json();
    expect(all.some((i) => i.custom)).toBe(true);
    expect(catalog.length).toBeGreaterThan(0);
    expect(catalog.every((i: IngredientDto) => !i.custom)).toBe(true);
  });

  it('respects the limit', async () => {
    const response = await get(t.app, '/api/ingredients?limit=3', cookie);
    expect(response.json()).toHaveLength(3);
  });
});

describe('custom tags', () => {
  it('creates, updates and deletes a personal tag', async () => {
    const created = await post(
      t.app,
      '/api/ingredients',
      { name: 'Oma Linsensuppe', allergens: ['fodmap'] },
      cookie,
    );
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ custom: true, allergens: ['fodmap'] });
    const id = created.json().id as string;

    const updated = await patch(
      t.app,
      `/api/ingredients/${id}`,
      { name: 'Linsensuppe', allergens: ['fodmap', 'gluten'] },
      cookie,
    );
    expect(updated.json()).toMatchObject({
      nameDe: 'Linsensuppe',
      allergens: ['fodmap', 'gluten'],
    });

    expect((await search('linsensuppe')).map((i) => i.id)).toContain(id);
    expect((await send('DELETE', `/api/ingredients/${id}`)).statusCode).toBe(204);
    expect(await search('linsensuppe')).toEqual([]);
  });

  it('rejects names that exist in the catalog or in own tags', async () => {
    const catalog = await post(t.app, '/api/ingredients', { name: 'milch' }, cookie);
    expect(catalog.statusCode).toBe(409);
    await post(t.app, '/api/ingredients', { name: 'Mein Tag' }, cookie);
    const duplicate = await post(t.app, '/api/ingredients', { name: 'mein tag' }, cookie);
    expect(duplicate.json().error.code).toBe('ingredient_exists');
  });

  it('keeps tags private and the catalog read-only', async () => {
    const created = await post(t.app, '/api/ingredients', { name: 'Geheim' }, cookie);
    const id = created.json().id as string;
    const other = await registerAndLogin(t, 'bob@example.com', 'Bob');

    expect(await search('geheim', other)).toEqual([]);
    expect((await patch(t.app, `/api/ingredients/${id}`, { name: 'x' }, other)).statusCode).toBe(
      404,
    );
    expect((await send('DELETE', `/api/ingredients/${id}`, undefined, other)).statusCode).toBe(404);

    const milk = await ingredientId('Milch');
    expect((await patch(t.app, `/api/ingredients/${milk}`, { name: 'x' }, cookie)).statusCode).toBe(
      404,
    );
  });

  it('lists own tags with the number of entries using them', async () => {
    const used = (
      await post(t.app, '/api/ingredients', { name: 'Benutzt', allergens: ['soy'] }, cookie)
    ).json();
    await post(t.app, '/api/ingredients', { name: 'Unbenutzt' }, cookie);
    for (const occurredAt of ['2026-01-10T08:00', '2026-01-11T08:00']) {
      await post(
        t.app,
        '/api/entries',
        { type: 'meal', occurredAt, title: 'x', ingredientIds: [used.id] },
        cookie,
      );
    }
    const other = await registerAndLogin(t, 'bob@example.com', 'Bob');
    await post(t.app, '/api/ingredients', { name: 'Bobs' }, other);

    const mine = (await get(t.app, '/api/ingredients/mine', cookie)).json();
    expect(
      mine.map((i: { nameDe: string; entryCount: number }) => [i.nameDe, i.entryCount]),
    ).toEqual([
      ['Benutzt', 2],
      ['Unbenutzt', 0],
    ]);
    expect(mine[0]).toMatchObject({ custom: true, allergens: ['soy'] });
    expect((await get(t.app, '/api/ingredients/mine')).statusCode).toBe(401);
  });

  it('rejects unknown allergens', async () => {
    const response = await post(
      t.app,
      '/api/ingredients',
      { name: 'X', allergens: ['bogus'] },
      cookie,
    );
    expect(response.statusCode).toBe(400);
  });
});

describe('entries', () => {
  it('creates a meal with ingredients and returns it in the day list', async () => {
    const milk = await ingredientId('Milch');
    const bread = await ingredientId('Weizenbrot');
    const created = await post(
      t.app,
      '/api/entries',
      {
        type: 'meal',
        occurredAt: '2026-01-10T08:30',
        title: 'Frühstück',
        ingredientIds: [milk, bread],
        note: 'war lecker',
      },
      cookie,
    );
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      type: 'meal',
      occurredAt: '2026-01-10T07:30:00.000Z',
      title: 'Frühstück',
      note: 'war lecker',
    });
    expect(created.json().ingredients.map((i: IngredientDto) => i.nameDe)).toEqual([
      'Milch',
      'Weizenbrot',
    ]);

    const list = await get(t.app, '/api/entries?date=2026-01-10', cookie);
    expect(list.json()).toHaveLength(1);
  });

  it('stores symptom, stool and medication entries', async () => {
    const symptom = await post(
      t.app,
      '/api/entries',
      { type: 'symptom', occurredAt: '2026-01-10T10:00', symptomType: 'bloating', severity: 6 },
      cookie,
    );
    expect(symptom.json()).toMatchObject({ symptomType: 'bloating', severity: 6, title: null });

    const stool = await post(
      t.app,
      '/api/entries',
      { type: 'stool', occurredAt: '2026-01-10T11:00', bristol: 4 },
      cookie,
    );
    expect(stool.json()).toMatchObject({ bristol: 4 });

    const medication = await post(
      t.app,
      '/api/entries',
      { type: 'medication', occurredAt: '2026-01-10T12:00', title: 'Ibuprofen 400' },
      cookie,
    );
    expect(medication.json()).toMatchObject({ title: 'Ibuprofen 400' });

    const list = (await get(t.app, '/api/entries?date=2026-01-10', cookie)).json();
    expect(list.map((e: { type: string }) => e.type)).toEqual(['symptom', 'stool', 'medication']);
  });

  it('assigns entries to days in the timezone of the user', async () => {
    for (const occurredAt of [
      '2026-01-09T23:30',
      '2026-01-10T00:30',
      '2026-01-10T23:30',
      '2026-01-11T00:15',
    ]) {
      await post(t.app, '/api/entries', { type: 'stool', occurredAt, bristol: 4 }, cookie);
    }
    const day = (await get(t.app, '/api/entries?date=2026-01-10', cookie)).json();
    expect(day.map((e: { occurredAt: string }) => e.occurredAt)).toEqual([
      '2026-01-09T23:30:00.000Z',
      '2026-01-10T22:30:00.000Z',
    ]);

    await patch(t.app, '/api/me', { timezone: 'America/New_York' }, cookie);
    const newYork = (await get(t.app, '/api/entries?date=2026-01-10', cookie)).json();
    expect(newYork.map((e: { occurredAt: string }) => e.occurredAt)).toEqual([
      '2026-01-10T22:30:00.000Z',
      '2026-01-10T23:15:00.000Z',
    ]);
  });

  it('validates input', async () => {
    const invalid = [
      { type: 'meal', occurredAt: '2026-01-10T08:30' },
      { type: 'meal', occurredAt: '2026-01-10T08:30', title: '   ' },
      { type: 'symptom', occurredAt: '2026-01-10T08:30', symptomType: 'bloating', severity: 11 },
      { type: 'symptom', occurredAt: '2026-01-10T08:30', symptomType: 'bogus', severity: 3 },
      { type: 'stool', occurredAt: '2026-01-10T08:30', bristol: 8 },
      { type: 'stool', occurredAt: '2026-01-10T08:30', bristol: 0 },
      { type: 'medication', occurredAt: '2026-01-10T08:30' },
      { type: 'stool', occurredAt: 'yesterday', bristol: 4 },
      { type: 'nap', occurredAt: '2026-01-10T08:30' },
    ];
    for (const body of invalid) {
      const response = await post(t.app, '/api/entries', body, cookie);
      expect(response.statusCode, JSON.stringify(body)).toBe(400);
    }
    expect((await get(t.app, '/api/entries?date=2026-02-31', cookie)).statusCode).toBe(400);
  });

  it('rejects entries in the future', async () => {
    const response = await post(
      t.app,
      '/api/entries',
      { type: 'stool', occurredAt: '2099-01-01T08:00', bristol: 4 },
      cookie,
    );
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('future_time');
  });

  it('rejects unknown or foreign ingredients', async () => {
    const foreign = await post(
      t.app,
      '/api/ingredients',
      { name: 'Bobs Tag' },
      await registerAndLogin(t, 'bob@example.com', 'Bob'),
    );
    const body = {
      type: 'meal',
      occurredAt: '2026-01-10T08:30',
      title: 'x',
    };
    const withForeign = await post(
      t.app,
      '/api/entries',
      { ...body, ingredientIds: [foreign.json().id] },
      cookie,
    );
    expect(withForeign.json().error.code).toBe('invalid_ingredient');
    const unknown = await post(
      t.app,
      '/api/entries',
      { ...body, ingredientIds: ['00000000-0000-4000-8000-000000000000'] },
      cookie,
    );
    expect(unknown.json().error.code).toBe('invalid_ingredient');
  });

  it('replaces an entry on update, including its type', async () => {
    const milk = await ingredientId('Milch');
    const created = await post(
      t.app,
      '/api/entries',
      { type: 'meal', occurredAt: '2026-01-10T08:30', title: 'Müsli', ingredientIds: [milk] },
      cookie,
    );
    const id = created.json().id as string;

    const updated = await send('PUT', `/api/entries/${id}`, {
      type: 'symptom',
      occurredAt: '2026-01-10T09:00',
      symptomType: 'nausea',
      severity: 2,
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      type: 'symptom',
      title: null,
      symptomType: 'nausea',
      severity: 2,
      ingredients: [],
    });
  });

  it('deletes entries and keeps them private', async () => {
    const created = await post(
      t.app,
      '/api/entries',
      { type: 'stool', occurredAt: '2026-01-10T08:30', bristol: 3 },
      cookie,
    );
    const id = created.json().id as string;
    const other = await registerAndLogin(t, 'bob@example.com', 'Bob');

    expect((await get(t.app, '/api/entries?date=2026-01-10', other)).json()).toEqual([]);
    expect(
      (
        await send(
          'PUT',
          `/api/entries/${id}`,
          { type: 'stool', occurredAt: '2026-01-10T08:30', bristol: 1 },
          other,
        )
      ).statusCode,
    ).toBe(404);
    expect((await send('DELETE', `/api/entries/${id}`, undefined, other)).statusCode).toBe(404);

    expect((await send('DELETE', `/api/entries/${id}`)).statusCode).toBe(204);
    expect((await get(t.app, '/api/entries?date=2026-01-10', cookie)).json()).toEqual([]);
  });

  it('removes entry links when a custom tag is deleted', async () => {
    const tag = (await post(t.app, '/api/ingredients', { name: 'Temp' }, cookie)).json();
    await post(
      t.app,
      '/api/entries',
      { type: 'meal', occurredAt: '2026-01-10T08:30', title: 'x', ingredientIds: [tag.id] },
      cookie,
    );
    await send('DELETE', `/api/ingredients/${tag.id}`);
    const list = (await get(t.app, '/api/entries?date=2026-01-10', cookie)).json();
    expect(list[0].ingredients).toEqual([]);
  });
});

describe('templates', () => {
  it('creates, lists and deletes templates', async () => {
    const milk = await ingredientId('Milch');
    const created = await post(
      t.app,
      '/api/templates',
      { name: 'Standardfrühstück', type: 'meal', title: 'Müsli', ingredientIds: [milk] },
      cookie,
    );
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ name: 'Standardfrühstück', type: 'meal' });
    expect(created.json().ingredients).toHaveLength(1);

    const list = (await get(t.app, '/api/templates', cookie)).json();
    expect(list).toHaveLength(1);

    const duplicate = await post(
      t.app,
      '/api/templates',
      { name: 'Standardfrühstück', type: 'meal', ingredientIds: [] },
      cookie,
    );
    expect(duplicate.statusCode).toBe(409);

    expect((await send('DELETE', `/api/templates/${created.json().id}`)).statusCode).toBe(204);
    expect((await get(t.app, '/api/templates', cookie)).json()).toEqual([]);
  });

  it('keeps templates private and rejects symptom templates', async () => {
    const created = await post(
      t.app,
      '/api/templates',
      { name: 'Mein', type: 'drink', ingredientIds: [] },
      cookie,
    );
    const other = await registerAndLogin(t, 'bob@example.com', 'Bob');
    expect((await get(t.app, '/api/templates', other)).json()).toEqual([]);
    expect(
      (await send('DELETE', `/api/templates/${created.json().id}`, undefined, other)).statusCode,
    ).toBe(404);

    const invalid = await post(
      t.app,
      '/api/templates',
      { name: 'S', type: 'symptom', ingredientIds: [] },
      cookie,
    );
    expect(invalid.statusCode).toBe(400);
  });
});
