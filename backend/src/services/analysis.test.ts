import { describe, expect, it } from 'vitest';
import type { IngredientDto } from '@foodlog/shared';
import {
  computeSuspects,
  confidenceOf,
  isOutcome,
  relativeRisk,
  type AnalysisEntry,
} from './analysis.ts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const START = Date.UTC(2026, 0, 1, 8);
const NOW = Date.UTC(2026, 11, 1);

const milk: IngredientDto = {
  id: 'milk',
  names: { de: 'Milch', en: 'Milk' },
  custom: false,
  allergens: ['lactose', 'milk_protein'],
};
const yogurt: IngredientDto = {
  id: 'yogurt',
  names: { de: 'Joghurt', en: 'Yogurt' },
  custom: false,
  allergens: ['lactose'],
};
const rice: IngredientDto = {
  id: 'rice',
  names: { de: 'Reis', en: 'Rice' },
  custom: false,
  allergens: [],
};
const ingredients = new Map([milk, yogurt, rice].map((i) => [i.id, i]));

function meal(day: number, ids: string[], hour = 0): AnalysisEntry {
  return {
    type: 'meal',
    at: START + day * DAY + hour * HOUR,
    severity: null,
    symptomType: null,
    bristol: null,
    ingredientIds: ids,
  };
}

function symptom(
  at: number,
  severity = 5,
  symptomType: AnalysisEntry['symptomType'] = 'bloating',
): AnalysisEntry {
  return { type: 'symptom', at, severity, symptomType, bristol: null, ingredientIds: [] };
}

function run(
  entries: AnalysisEntry[],
  overrides: Partial<Parameters<typeof computeSuspects>[0]> = {},
) {
  return computeSuspects({
    entries,
    ingredients,
    windowMinutes: 480,
    outcome: 'symptoms',
    minSeverity: 3,
    from: START - DAY,
    to: START + 100 * DAY,
    now: NOW,
    ...overrides,
  });
}

function dataset() {
  const entries: AnalysisEntry[] = [];
  for (let day = 0; day < 10; day++) {
    entries.push(meal(day, ['milk']));
    if (day < 8) entries.push(symptom(START + day * DAY + 2 * HOUR));
  }
  for (let day = 10; day < 20; day++) {
    entries.push(meal(day, ['rice']));
    if (day === 10) entries.push(symptom(START + day * DAY + 3 * HOUR));
  }
  return entries;
}

describe('relativeRisk', () => {
  it('computes the ratio and a confidence interval around it', () => {
    const { rr, low, high } = relativeRisk(8, 10, 1, 10);
    expect(rr).toBeCloseTo(8, 5);
    expect(low).toBeGreaterThan(1);
    expect(low).toBeLessThan(rr);
    expect(high).toBeGreaterThan(rr);
  });

  it('stays finite with zero cells', () => {
    const noHits = relativeRisk(0, 10, 3, 10);
    const noBaseline = relativeRisk(5, 10, 0, 10);
    for (const value of [
      noHits.rr,
      noHits.low,
      noHits.high,
      noBaseline.rr,
      noBaseline.low,
      noBaseline.high,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(noBaseline.rr).toBeGreaterThan(1);
    expect(noHits.rr).toBeLessThan(1);
  });

  it('derives confidence from interval and data volume', () => {
    expect(confidenceOf(1.4, 12, 6)).toBe('high');
    expect(confidenceOf(1.4, 6, 3)).toBe('medium');
    expect(confidenceOf(0.8, 40, 20)).toBe('low');
  });
});

describe('isOutcome', () => {
  const base = { at: 0, ingredientIds: [] };
  it('applies severity and symptom type filters', () => {
    const entry: AnalysisEntry = {
      ...base,
      type: 'symptom',
      severity: 4,
      symptomType: 'nausea',
      bristol: null,
    };
    expect(isOutcome(entry, 'symptoms', 3)).toBe(true);
    expect(isOutcome(entry, 'symptoms', 5)).toBe(false);
    expect(isOutcome(entry, 'nausea', 3)).toBe(true);
    expect(isOutcome(entry, 'bloating', 3)).toBe(false);
    expect(isOutcome(entry, 'stool', 3)).toBe(false);
  });

  it('treats only loose or hard stool as abnormal', () => {
    const stool = (bristol: number): AnalysisEntry => ({
      ...base,
      type: 'stool',
      severity: null,
      symptomType: null,
      bristol,
    });
    expect([1, 2, 3, 4, 5, 6, 7].map((b) => isOutcome(stool(b), 'stool', 3))).toEqual([
      true,
      true,
      false,
      false,
      false,
      true,
      true,
    ]);
    expect(isOutcome(stool(7), 'symptoms', 3)).toBe(false);
  });
});

describe('computeSuspects', () => {
  it('finds the ingredient and its allergens that precede symptoms', async () => {
    const result = run(dataset());
    const top = result.ingredients[0]!;
    expect(top.ingredient?.id).toBe('milk');
    expect(top).toMatchObject({ exposures: 10, exposuresWithOutcome: 8 });
    expect(top.relativeRisk).toBeCloseTo(8, 5);
    expect(top.confidence).toBe('high');
    expect(top.medianLagMinutes).toBe(120);

    const lactose = result.allergens.find((item) => item.allergen === 'lactose');
    expect(lactose).toMatchObject({ exposures: 10, exposuresWithOutcome: 8 });
    expect(result.allergens.some((item) => item.allergen === 'milk_protein')).toBe(true);
    expect(result.foodEntries).toBe(20);
  });

  it('does not report a protective or neutral ingredient', () => {
    const result = run(dataset());
    expect(result.ingredients.map((item) => item.key)).not.toContain('rice');
  });

  it('aggregates allergens across different ingredients', () => {
    const entries: AnalysisEntry[] = [];
    for (let day = 0; day < 10; day++) {
      entries.push(meal(day, [day % 2 ? 'milk' : 'yogurt']));
      if (day < 8) entries.push(symptom(START + day * DAY + HOUR));
    }
    for (let day = 10; day < 20; day++) entries.push(meal(day, ['rice']));
    const result = run(entries);
    expect(result.allergens.find((item) => item.allergen === 'lactose')?.exposures).toBe(10);
    expect(result.ingredients.find((item) => item.key === 'milk')?.exposures).toBe(5);
  });

  it('respects the time window', () => {
    const late = dataset().map((entry) =>
      entry.type === 'symptom' ? { ...entry, at: entry.at + 5 * HOUR } : entry,
    );
    expect(run(late, { windowMinutes: 480 }).ingredients[0]?.key).toBe('milk');
    expect(run(late, { windowMinutes: 180 }).ingredients).toEqual([]);
  });

  it('ignores symptoms that happened before the meal', () => {
    const before = dataset().map((entry) =>
      entry.type === 'symptom' ? { ...entry, at: entry.at - 3 * HOUR } : entry,
    );
    expect(run(before).ingredients).toEqual([]);
  });

  it('hides ingredients with too little data', () => {
    const entries = dataset().filter(
      (entry) =>
        !(entry.type === 'meal' && entry.at > START + 3 * DAY && entry.ingredientIds[0] === 'milk'),
    );
    expect(run(entries).ingredients.find((item) => item.key === 'milk')).toBeUndefined();
  });

  it('excludes meals whose window has not finished yet', () => {
    const entries = dataset();
    const lastMeal = Math.max(...entries.filter((e) => e.type === 'meal').map((e) => e.at));
    const result = run(entries, { now: lastMeal + 2 * HOUR });
    expect(result.censored).toBe(1);
    expect(result.foodEntries).toBe(19);
  });

  it('only counts meals inside the period', () => {
    const result = run(dataset(), { from: START + 5 * DAY, to: START + 12 * DAY });
    expect(result.foodEntries).toBe(8);
  });

  it('supports specific symptoms and abnormal stool as outcome', () => {
    const entries = dataset().map((entry) =>
      entry.type === 'symptom' ? { ...entry, symptomType: 'nausea' as const } : entry,
    );
    expect(run(entries, { outcome: 'bloating' }).ingredients).toEqual([]);
    expect(run(entries, { outcome: 'nausea' }).ingredients[0]?.key).toBe('milk');

    const stoolEntries = dataset().map((entry) =>
      entry.type === 'symptom'
        ? { ...entry, type: 'stool' as const, symptomType: null, severity: null, bristol: 7 }
        : entry,
    );
    expect(run(stoolEntries, { outcome: 'stool' }).ingredients[0]?.key).toBe('milk');
    expect(run(stoolEntries, { outcome: 'symptoms' }).ingredients).toEqual([]);
  });

  it('builds a lag histogram across the window', () => {
    const histogram = run(dataset()).ingredients[0]!.lagHistogram;
    expect(histogram).toHaveLength(6);
    expect(histogram.reduce((sum, value) => sum + value, 0)).toBe(8);
    expect(histogram[1]).toBe(8);
  });

  it('groups ingredients that are always eaten together', () => {
    const entries = dataset().map((entry) =>
      entry.type === 'meal' && entry.ingredientIds[0] === 'milk'
        ? { ...entry, ingredientIds: ['milk', 'yogurt'] }
        : entry,
    );
    const result = run(entries);
    const grouped = result.ingredients.filter((item) => item.exposures === 10);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.key).toBe('milk');
    expect(grouped[0]?.alsoWith.map((i) => i.id)).toEqual(['yogurt']);
    expect(result.ingredients.some((item) => item.key === 'yogurt')).toBe(false);
  });

  it('keeps ingredients separate when their meals differ', () => {
    const entries = dataset();
    entries.push(meal(30, ['yogurt']), meal(31, ['yogurt', 'milk']));
    const result = run(entries);
    expect(result.ingredients.every((item) => item.alsoWith.length === 0)).toBe(true);
  });

  it('returns nothing without outcomes', () => {
    const entries = dataset().filter((entry) => entry.type !== 'symptom');
    const result = run(entries);
    expect(result.ingredients).toEqual([]);
    expect(result.outcomeEvents).toBe(0);
  });
});
