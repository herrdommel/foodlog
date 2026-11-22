import { describe, expect, it } from 'vitest';
import { computeContext, type ContextEntry } from '../src/services/context-analysis.ts';

const date = (day: number) => `2026-01-${String(day).padStart(2, '0')}`;

function stressDays(levels: number[]): ContextEntry[] {
  return levels.map((rating, index) => ({
    date: date(index + 1),
    type: 'stress',
    sleepMinutes: null,
    rating,
  }));
}

describe('computeContext', () => {
  it('needs enough days on both sides and enough outcome days', () => {
    const entries = stressDays([5, 5, 5, 5, 2, 2, 2, 2, 2, 2]);
    const outcomeDays = new Set([date(1), date(2), date(3), date(7)]);
    expect(computeContext({ entries, outcomeDays, lastCompleteDay: date(31) })).toEqual([]);
    expect(
      computeContext({ entries, outcomeDays: new Set([date(1)]), lastCompleteDay: date(31) }),
    ).toEqual([]);
  });

  it('computes rates and a risk ratio for stressful days', () => {
    const entries = stressDays([5, 4, 5, 4, 5, 1, 2, 3, 2, 1, 2, 3]);
    const outcomeDays = new Set([date(1), date(2), date(3), date(4), date(5), date(8)]);
    const [stress] = computeContext({ entries, outcomeDays, lastCompleteDay: date(31) });
    expect(stress).toMatchObject({
      factor: 'high_stress',
      days: 5,
      daysWithOutcome: 5,
      otherDays: 7,
      otherDaysWithOutcome: 1,
      rate: 1,
    });
    expect(stress!.relativeRisk).toBeGreaterThan(1);
    expect(stress!.ciLow).toBeGreaterThan(1);
  });

  it('ignores days that are not finished yet', () => {
    const entries = stressDays([5, 5, 5, 5, 5, 1, 1, 1, 1, 1]);
    const outcomeDays = new Set([date(1), date(2), date(3)]);
    expect(computeContext({ entries, outcomeDays, lastCompleteDay: date(9) })).toEqual([]);
  });

  it('sums sleep per day and uses the lowest quality and highest stress', () => {
    const entries: ContextEntry[] = [];
    for (let day = 1; day <= 12; day++) {
      const short = day <= 6;
      entries.push({
        date: date(day),
        type: 'sleep',
        sleepMinutes: short ? 200 : 480,
        rating: short ? 4 : 3,
      });
      if (short) entries.push({ date: date(day), type: 'sleep', sleepMinutes: 100, rating: 1 });
    }
    const outcomeDays = new Set([date(1), date(2), date(3), date(4), date(9)]);
    const result = computeContext({ entries, outcomeDays, lastCompleteDay: date(31) });
    expect(result.map((item) => item.factor).sort()).toEqual(['poor_sleep', 'short_sleep']);
    expect(result.find((item) => item.factor === 'short_sleep')).toMatchObject({
      days: 6,
      otherDays: 6,
    });
  });
});
