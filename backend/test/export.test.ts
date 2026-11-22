import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { BOM, csvCell, toCsv } from '../src/lib/csv.ts';
import { featureFlags, userFeatureOverrides, users } from '../src/db/schema.ts';
import { eq } from 'drizzle-orm';
import { createTestApp, get, patch, post, registerAndLogin, type TestApp } from './helpers.ts';

describe('csv', () => {
  it('quotes values that contain separators, quotes or line breaks', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
  });

  it('neutralises spreadsheet formulas in text but keeps numbers', () => {
    for (const value of ['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\tx']) {
      expect(csvCell(value).replace(/^"/, '').startsWith("'")).toBe(true);
    }
    expect(csvCell(-3)).toBe('-3');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('writes a real byte order mark and CRLF line endings', () => {
    expect(BOM.charCodeAt(0)).toBe(0xfeff);
    expect(BOM).toHaveLength(1);
    expect(
      toCsv([
        ['a', 'b'],
        ['1', '2'],
      ]),
    ).toBe(`${BOM}a,b\r\n1,2\r\n`);
  });
});

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

async function ingredientId(q: string): Promise<string> {
  return (await get(t.app, `/api/ingredients?q=${q}`, cookie)).json()[0].id;
}

function entry(body: object, as = cookie) {
  return post(t.app, '/api/entries', body, as);
}

const range = 'from=2026-01-01&to=2026-01-31';

describe('GET /api/export/entries.csv', () => {
  it('requires authentication', async () => {
    expect((await get(t.app, `/api/export/entries.csv?${range}`)).statusCode).toBe(401);
  });

  it('validates the period', async () => {
    for (const query of [
      'from=2026-02-01&to=2026-01-01',
      'from=2020-01-01&to=2026-01-01',
      'from=x&to=y',
      '',
    ]) {
      expect((await get(t.app, `/api/export/entries.csv?${query}`, cookie)).statusCode, query).toBe(
        400,
      );
    }
  });

  it('exports entries as csv with localised ingredient names and allergens', async () => {
    const milk = await ingredientId('Milch');
    const bread = await ingredientId('Weizenbrot');
    await entry({
      type: 'meal',
      occurredAt: '2026-01-10T08:30',
      title: 'Frühstück, groß',
      ingredientIds: [milk, bread],
      note: 'sagte "lecker"',
    });
    await entry({
      type: 'symptom',
      occurredAt: '2026-01-10T10:00',
      symptomType: 'bloating',
      severity: 6,
    });
    await entry({ type: 'stool', occurredAt: '2026-01-11T07:00', bristol: 4 });
    await entry({ type: 'medication', occurredAt: '2026-01-12T07:00', title: '=HYPERLINK("x")' });

    const response = await get(t.app, `/api/export/entries.csv?${range}`, cookie);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="foodlog-2026-01-01_2026-01-31.csv"',
    );
    expect(response.headers['cache-control']).toBe('no-store');

    const lines = response.body.replace(BOM, '').trimEnd().split('\r\n');
    expect(lines[0]).toBe(
      'local_time,utc_time,type,title,ingredients,allergens,symptom_type,severity,bristol,sleep_minutes,rating,note',
    );
    expect(lines).toHaveLength(5);
    expect(lines[1]).toBe(
      '2026-01-10 08:30,2026-01-10T07:30:00.000Z,meal,"Frühstück, groß",Milch; Weizenbrot,fodmap; gluten; lactose; milk_protein,,,,,,"sagte ""lecker"""',
    );
    expect(lines[2]).toBe('2026-01-10 10:00,2026-01-10T09:00:00.000Z,symptom,,,,bloating,6,,,,');
    expect(lines[3]).toBe('2026-01-11 07:00,2026-01-11T06:00:00.000Z,stool,,,,,,4,,,');
    expect(lines[4]).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it('uses English names for English users and respects the period', async () => {
    await patch(t.app, '/api/me', { locale: 'en' }, cookie);
    const milk = await ingredientId('Milch');
    await entry({
      type: 'meal',
      occurredAt: '2026-01-10T08:30',
      title: 'a',
      ingredientIds: [milk],
    });
    await entry({
      type: 'meal',
      occurredAt: '2026-02-10T08:30',
      title: 'b',
      ingredientIds: [milk],
    });
    const body = (await get(t.app, `/api/export/entries.csv?${range}`, cookie)).body;
    expect(body).toContain(',Milk,');
    expect(body).not.toContain(',b,');
  });

  it('contains only the data of the current user', async () => {
    await entry({ type: 'stool', occurredAt: '2026-01-10T08:30', bristol: 4 });
    const other = await registerAndLogin(t, 'bob@example.com', 'Bob');
    const body = (await get(t.app, `/api/export/entries.csv?${range}`, other)).body;
    expect(body.replace(BOM, '').trimEnd().split('\r\n')).toHaveLength(1);
  });

  it('exports only header when there is nothing', async () => {
    const body = (await get(t.app, `/api/export/entries.csv?${range}`, cookie)).body;
    expect(body.replace(BOM, '').trimEnd().split('\r\n')).toHaveLength(1);
  });

  it('is blocked when the feature is switched off for the user', async () => {
    const [user] = await t.db.select().from(users).where(eq(users.email, 'anna@example.com'));
    await t.db
      .insert(userFeatureOverrides)
      .values({ userId: user!.id, key: 'data_export', enabled: false });
    const response = await get(t.app, `/api/export/entries.csv?${range}`, cookie);
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('feature_disabled');
    expect((await get(t.app, '/api/me', cookie)).json().features.data_export).toBe(false);
  });

  it('is blocked globally and the global switch beats a user override', async () => {
    const [user] = await t.db.select().from(users).where(eq(users.email, 'anna@example.com'));
    await t.db
      .insert(featureFlags)
      .values({ key: 'data_export', enabled: false, defaultForUsers: true });
    await t.db
      .insert(userFeatureOverrides)
      .values({ userId: user!.id, key: 'data_export', enabled: true });
    const response = await get(t.app, `/api/export/entries.csv?${range}`, cookie);
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('feature_disabled');
  });
});
