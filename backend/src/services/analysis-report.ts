import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import {
  dayRangeUtc,
  shiftDate,
  todayInTimeZone,
  utcToWallTime,
  type AnalysisDto,
  type AnalysisQuery,
  type EntryType,
  type IngredientDto,
  type SymptomType,
} from '@foodlog/shared';
import type { Database } from '../db/client.ts';
import { entries, entryIngredients } from '../db/schema.ts';
import {
  computeSuspects,
  isOutcome,
  MIN_EXPOSURES,
  MIN_OUTCOMES,
  type AnalysisEntry,
} from './analysis.ts';
import { computeContext, type ContextEntry } from './context-analysis.ts';
import { loadIngredientsById } from './ingredients.ts';
import type { UserRow } from './users.ts';

const HOUR = 3_600_000;

export async function buildAnalysis(
  db: Database,
  user: UserRow,
  query: AnalysisQuery,
): Promise<AnalysisDto> {
  const timeZone = user.timezone;
  const from = dayRangeUtc(query.from, timeZone).from;
  const periodEnd = dayRangeUtc(query.to, timeZone).to;
  const windowMs = query.window * HOUR;

  const rows = await db
    .select()
    .from(entries)
    .where(
      and(
        eq(entries.userId, user.id),
        gte(entries.occurredAt, from),
        lt(entries.occurredAt, new Date(periodEnd.getTime() + windowMs)),
      ),
    );
  const links =
    rows.length === 0
      ? []
      : await db
          .select()
          .from(entryIngredients)
          .where(
            inArray(
              entryIngredients.entryId,
              rows.map((row) => row.id),
            ),
          );
  const ingredients = await loadIngredientsById(db, [
    ...new Set(links.map((link) => link.ingredientId)),
  ]);

  const idsByEntry = new Map<string, string[]>();
  for (const link of links) {
    const list = idsByEntry.get(link.entryId) ?? [];
    list.push(link.ingredientId);
    idsByEntry.set(link.entryId, list);
  }

  const toAnalysisEntry = (row: (typeof rows)[number]): AnalysisEntry => ({
    type: row.type,
    at: row.occurredAt.getTime(),
    severity: row.severity,
    symptomType: row.symptomType as SymptomType | null,
    bristol: row.bristol,
    ingredientIds: idsByEntry.get(row.id) ?? [],
  });
  const analysisEntries = rows.map(toAnalysisEntry);

  const suspects = computeSuspects({
    entries: analysisEntries,
    ingredients,
    windowMinutes: query.window * 60,
    outcome: query.outcome,
    minSeverity: query.minSeverity,
    from: from.getTime(),
    to: periodEnd.getTime() - 1,
    now: Date.now(),
  });

  const inPeriod = rows.filter((row) => row.occurredAt < periodEnd);
  const entryCounts: Record<EntryType, number> = {
    meal: 0,
    drink: 0,
    symptom: 0,
    stool: 0,
    medication: 0,
    sleep: 0,
    stress: 0,
  };
  const daysWithEntries = new Set<string>();
  const bristolDistribution = new Array<number>(7).fill(0);
  const symptomHeatmap = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  const perDay = new Map<string, { count: number; maxSeverity: number }>();
  const ingredientCounts = new Map<string, number>();
  const contextEntries: ContextEntry[] = [];
  const outcomeDays = new Set<string>();

  for (const row of inPeriod) {
    entryCounts[row.type] += 1;
    const wall = utcToWallTime(row.occurredAt, timeZone);
    const date = wall.slice(0, 10);
    daysWithEntries.add(date);
    if (row.type === 'sleep' || row.type === 'stress') {
      contextEntries.push({
        date,
        type: row.type,
        sleepMinutes: row.sleepMinutes,
        rating: row.rating,
      });
    }
    if (isOutcome(toAnalysisEntry(row), query.outcome, query.minSeverity)) {
      outcomeDays.add(date);
    }
    if (row.type === 'stool' && row.bristol) bristolDistribution[row.bristol - 1]! += 1;
    if (row.type === 'symptom') {
      const day = perDay.get(date) ?? { count: 0, maxSeverity: 0 };
      day.count += 1;
      day.maxSeverity = Math.max(day.maxSeverity, row.severity ?? 0);
      perDay.set(date, day);
      const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
      symptomHeatmap[weekday]![Number(wall.slice(11, 13))]! += 1;
    }
    if (row.type === 'meal' || row.type === 'drink') {
      for (const id of idsByEntry.get(row.id) ?? []) {
        ingredientCounts.set(id, (ingredientCounts.get(id) ?? 0) + 1);
      }
    }
  }

  const symptomsByDay: AnalysisDto['symptomsByDay'] = [];
  for (let date = query.from; date <= query.to; date = shiftDate(date, 1)) {
    symptomsByDay.push({ date, ...(perDay.get(date) ?? { count: 0, maxSeverity: 0 }) });
  }

  const topIngredients = [...ingredientCounts]
    .map(([id, count]) => ({ ingredient: ingredients.get(id) as IngredientDto, count }))
    .filter((item) => item.ingredient)
    .sort((a, b) => b.count - a.count || a.ingredient.nameDe.localeCompare(b.ingredient.nameDe))
    .slice(0, 10);

  return {
    period: { from: query.from, to: query.to, days: symptomsByDay.length },
    window: query.window,
    outcome: query.outcome,
    minSeverity: query.minSeverity,
    summary: {
      entryCounts,
      daysWithEntries: daysWithEntries.size,
      foodEntries: suspects.foodEntries,
      outcomeEvents: suspects.outcomeEvents,
      censoredFoodEntries: suspects.censored,
    },
    topIngredients,
    symptomsByDay,
    bristolDistribution,
    symptomHeatmap,
    suspects: { ingredients: suspects.ingredients, allergens: suspects.allergens },
    context: computeContext({
      entries: contextEntries,
      outcomeDays,
      lastCompleteDay: shiftDate(todayInTimeZone(timeZone), -1),
    }),
    minExposures: MIN_EXPOSURES,
    minOutcomes: MIN_OUTCOMES,
  };
}
