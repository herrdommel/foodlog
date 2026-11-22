import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { featureFlags } from '../src/db/schema.ts';
import { createTestApp, get, patch, post, registerAndLogin, type TestApp } from './helpers.ts';

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
  const found = (await get(t.app, `/api/ingredients?q=${q}`, cookie)).json();
  return found[0].id;
}

function entry(body: object) {
  return post(t.app, '/api/entries', body, cookie);
}

async function seedPattern() {
  const milk = await ingredientId('Milch');
  const rice = await ingredientId('Reis');
  for (let day = 1; day <= 10; day++) {
    const date = `2026-01-${String(day).padStart(2, '0')}`;
    await entry({ type: 'meal', occurredAt: `${date}T08:00`, title: 'a', ingredientIds: [milk] });
    if (day <= 8) {
      await entry({
        type: 'symptom',
        occurredAt: `${date}T10:00`,
        symptomType: 'bloating',
        severity: 6,
      });
    }
    await entry({ type: 'stool', occurredAt: `${date}T09:00`, bristol: day <= 8 ? 6 : 4 });
  }
  for (let day = 11; day <= 20; day++) {
    const date = `2026-01-${String(day).padStart(2, '0')}`;
    await entry({ type: 'meal', occurredAt: `${date}T08:00`, title: 'b', ingredientIds: [rice] });
  }
}

const range = 'from=2026-01-01&to=2026-01-31';

async function seedContext(withOutcome: (day: number, poor: boolean) => boolean) {
  for (let day = 1; day <= 20; day++) {
    const date = `2026-01-${String(day).padStart(2, '0')}`;
    const poor = day <= 10;
    await entry({
      type: 'sleep',
      occurredAt: `${date}T07:00`,
      sleepMinutes: poor ? 300 : 450,
      rating: poor ? 2 : 4,
    });
    await entry({ type: 'stress', occurredAt: `${date}T18:00`, rating: poor ? 5 : 2 });
    if (withOutcome(day, poor)) {
      await entry({
        type: 'symptom',
        occurredAt: `${date}T12:00`,
        symptomType: 'fatigue',
        severity: 5,
      });
    }
  }
}

describe('context factors', () => {
  it('compares days with and without a factor', async () => {
    await seedContext((day, poor) => (poor ? day <= 9 : day === 15));
    const body = (await get(t.app, `/api/analysis?${range}`, cookie)).json();
    expect(body.context.map((item: { factor: string }) => item.factor).sort()).toEqual([
      'high_stress',
      'poor_sleep',
      'short_sleep',
    ]);
    const stress = body.context.find((item: { factor: string }) => item.factor === 'high_stress');
    expect(stress).toMatchObject({
      days: 10,
      daysWithOutcome: 9,
      otherDays: 10,
      otherDaysWithOutcome: 1,
    });
    expect(stress.relativeRisk).toBeCloseTo(9, 5);
    expect(stress.ciLow).toBeGreaterThan(1);
    expect(body.summary.entryCounts).toMatchObject({ sleep: 20, stress: 20 });
  });

  it('stays empty without enough data and when the feature is off', async () => {
    expect((await get(t.app, `/api/analysis?${range}`, cookie)).json().context).toEqual([]);
    await seedContext((day, poor) => (poor ? day <= 9 : day === 15));
    await t.db
      .insert(featureFlags)
      .values({ key: 'context_factors', enabled: false, defaultForUsers: true });
    expect((await get(t.app, `/api/analysis?${range}`, cookie)).json().context).toEqual([]);
    await t.db.delete(featureFlags).where(eq(featureFlags.key, 'context_factors'));
  });
});

describe('GET /api/analysis', () => {
  it('requires authentication', async () => {
    expect((await get(t.app, `/api/analysis?${range}`)).statusCode).toBe(401);
  });

  it('validates the query', async () => {
    for (const query of [
      'from=2026-01-31&to=2026-01-01',
      'from=2024-01-01&to=2026-01-01',
      `${range}&window=5`,
      `${range}&outcome=bogus`,
      `${range}&minSeverity=11`,
      'from=2026-01-01',
      'from=nope&to=2026-01-02',
    ]) {
      const response = await get(t.app, `/api/analysis?${query}`, cookie);
      expect(response.statusCode, query).toBe(400);
    }
  });

  it('returns an empty overview without data', async () => {
    const body = (await get(t.app, `/api/analysis?${range}`, cookie)).json();
    expect(body.period).toEqual({ from: '2026-01-01', to: '2026-01-31', days: 31 });
    expect(body.symptomsByDay).toHaveLength(31);
    expect(body.summary.entryCounts).toEqual({
      meal: 0,
      drink: 0,
      symptom: 0,
      stool: 0,
      medication: 0,
      sleep: 0,
      stress: 0,
    });
    expect(body.suspects).toEqual({ ingredients: [], allergens: [] });
    expect(body.topIngredients).toEqual([]);
    expect(body.bristolDistribution).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('summarises entries and finds the suspicious ingredient', async () => {
    await seedPattern();
    const body = (await get(t.app, `/api/analysis?${range}`, cookie)).json();

    expect(body.summary.entryCounts).toMatchObject({ meal: 20, symptom: 8, stool: 10 });
    expect(body.summary.daysWithEntries).toBe(20);
    expect(body.summary.foodEntries).toBe(20);
    expect(body.summary.outcomeEvents).toBe(8);

    expect(body.bristolDistribution).toEqual([0, 0, 0, 2, 0, 8, 0]);
    expect(body.topIngredients.map((i: { count: number }) => i.count)).toEqual([10, 10]);
    expect(body.symptomsByDay[0]).toEqual({ date: '2026-01-01', count: 1, maxSeverity: 6 });
    expect(body.symptomsByDay[9]).toEqual({ date: '2026-01-10', count: 0, maxSeverity: 0 });

    const monday = body.symptomHeatmap[(new Date('2026-01-05').getUTCDay() + 6) % 7];
    expect(monday[10]).toBeGreaterThan(0);

    const top = body.suspects.ingredients[0];
    expect(top.ingredient.nameEn).toBe('Milk');
    expect(top).toMatchObject({ exposures: 10, exposuresWithOutcome: 8, confidence: 'high' });
    expect(top.relativeRisk).toBeCloseTo(17, 3);
    expect(top.ciLow).toBeGreaterThan(1);
    expect(top.medianLagMinutes).toBe(120);
    const allergens = body.suspects.allergens.map((a: { allergen: string }) => a.allergen);
    expect(allergens).toEqual(expect.arrayContaining(['lactose', 'milk_protein']));
  });

  it('uses the selected outcome and window', async () => {
    await seedPattern();
    const stool = (
      await get(t.app, `/api/analysis?${range}&outcome=stool&window=3`, cookie)
    ).json();
    expect(stool.suspects.ingredients[0].ingredient.nameEn).toBe('Milk');
    const nausea = (await get(t.app, `/api/analysis?${range}&outcome=nausea`, cookie)).json();
    expect(nausea.suspects.ingredients).toEqual([]);
  });

  it('restricts the analysis to the period', async () => {
    await seedPattern();
    const body = (await get(t.app, '/api/analysis?from=2026-01-03&to=2026-01-05', cookie)).json();
    expect(body.summary.entryCounts).toMatchObject({ meal: 3, symptom: 3, stool: 3 });
    expect(body.period.days).toBe(3);
  });

  it('keeps data private', async () => {
    await seedPattern();
    const other = await registerAndLogin(t, 'bob@example.com', 'Bob');
    const body = (await get(t.app, `/api/analysis?${range}`, other)).json();
    expect(body.summary.entryCounts.meal).toBe(0);
    expect(body.suspects.ingredients).toEqual([]);
  });

  it('assigns days by the time zone of the user', async () => {
    await entry({
      type: 'symptom',
      occurredAt: '2026-01-01T00:30',
      symptomType: 'gas',
      severity: 4,
    });
    await patch(t.app, '/api/me', { timezone: 'America/New_York' }, cookie);
    const body = (await get(t.app, `/api/analysis?${range}`, cookie)).json();
    const days = body.symptomsByDay
      .filter((d: { count: number }) => d.count > 0)
      .map((d: { date: string }) => d.date);
    expect(days).toEqual([]);
    expect(body.summary.entryCounts.symptom).toBe(0);
  });
});
