import {
  CONTEXT_FACTORS,
  HIGH_STRESS_RATING,
  POOR_SLEEP_RATING,
  SHORT_SLEEP_MINUTES,
  type ContextFactor,
  type ContextFactorDto,
} from '@foodlog/shared';
import { confidenceOf, MIN_EXPOSURES, MIN_OUTCOMES, relativeRisk } from './analysis.ts';

export interface ContextEntry {
  date: string;
  type: 'sleep' | 'stress';
  sleepMinutes: number | null;
  rating: number | null;
}

interface DayValues {
  sleepMinutes: number | null;
  sleepRating: number | null;
  stress: number | null;
}

const FACTOR_TEST: Record<ContextFactor, (day: DayValues) => boolean | null> = {
  short_sleep: (day) => (day.sleepMinutes === null ? null : day.sleepMinutes < SHORT_SLEEP_MINUTES),
  poor_sleep: (day) => (day.sleepRating === null ? null : day.sleepRating <= POOR_SLEEP_RATING),
  high_stress: (day) => (day.stress === null ? null : day.stress >= HIGH_STRESS_RATING),
};

function perDay(entries: ContextEntry[]): Map<string, DayValues> {
  const days = new Map<string, DayValues>();
  for (const entry of entries) {
    const day = days.get(entry.date) ?? { sleepMinutes: null, sleepRating: null, stress: null };
    if (entry.type === 'sleep') {
      if (entry.sleepMinutes !== null)
        day.sleepMinutes = (day.sleepMinutes ?? 0) + entry.sleepMinutes;
      if (entry.rating !== null) {
        day.sleepRating = Math.min(day.sleepRating ?? entry.rating, entry.rating);
      }
    } else if (entry.rating !== null) {
      day.stress = Math.max(day.stress ?? entry.rating, entry.rating);
    }
    days.set(entry.date, day);
  }
  return days;
}

export function computeContext(input: {
  entries: ContextEntry[];
  outcomeDays: Set<string>;
  lastCompleteDay: string;
}): ContextFactorDto[] {
  const days = [...perDay(input.entries)].filter(([date]) => date <= input.lastCompleteDay);
  const totalWithOutcome = days.filter(([date]) => input.outcomeDays.has(date)).length;
  if (totalWithOutcome < MIN_OUTCOMES) return [];

  const result: ContextFactorDto[] = [];
  for (const factor of CONTEXT_FACTORS) {
    const exposed: string[] = [];
    const other: string[] = [];
    for (const [date, values] of days) {
      const met = FACTOR_TEST[factor](values);
      if (met === true) exposed.push(date);
      else if (met === false) other.push(date);
    }
    if (exposed.length < MIN_EXPOSURES || other.length < MIN_EXPOSURES) continue;
    const hits = exposed.filter((date) => input.outcomeDays.has(date)).length;
    const otherHits = other.filter((date) => input.outcomeDays.has(date)).length;
    const { rr, low, high } = relativeRisk(hits, exposed.length, otherHits, other.length);
    result.push({
      factor,
      days: exposed.length,
      daysWithOutcome: hits,
      rate: hits / exposed.length,
      otherDays: other.length,
      otherDaysWithOutcome: otherHits,
      otherRate: otherHits / other.length,
      relativeRisk: rr,
      ciLow: low,
      ciHigh: high,
      confidence: confidenceOf(low, exposed.length, hits),
    });
  }
  return result;
}
