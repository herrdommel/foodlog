import type {
  Allergen,
  AnalysisOutcome,
  Confidence,
  EntryType,
  IngredientDto,
  SuspectDto,
  SymptomType,
} from '@foodlog/shared';

export const MIN_EXPOSURES = 5;
export const MIN_OUTCOMES = 3;
const LAG_BUCKETS = 6;
const MINUTE = 60_000;

export interface AnalysisEntry {
  type: EntryType;
  at: number;
  severity: number | null;
  symptomType: SymptomType | null;
  bristol: number | null;
  ingredientIds: string[];
}

export function isOutcome(
  entry: AnalysisEntry,
  outcome: AnalysisOutcome,
  minSeverity: number,
): boolean {
  if (outcome === 'stool') {
    return (
      entry.type === 'stool' && entry.bristol !== null && (entry.bristol <= 2 || entry.bristol >= 6)
    );
  }
  if (entry.type !== 'symptom' || (entry.severity ?? 0) < minSeverity) return false;
  return outcome === 'symptoms' || entry.symptomType === outcome;
}

interface Food {
  at: number;
  ingredientIds: Set<string>;
  allergens: Set<Allergen>;
  lagMinutes: number | null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function relativeRisk(a: number, n1: number, c: number, n0: number) {
  let exposedHits = a;
  let exposedTotal = n1;
  let otherHits = c;
  let otherTotal = n0;
  if (exposedHits === 0 || otherHits === 0) {
    exposedHits += 0.5;
    otherHits += 0.5;
    exposedTotal += 1;
    otherTotal += 1;
  }
  const rr = exposedHits / exposedTotal / (otherHits / otherTotal);
  const se = Math.sqrt(1 / exposedHits - 1 / exposedTotal + 1 / otherHits - 1 / otherTotal);
  return { rr, low: Math.exp(Math.log(rr) - 1.96 * se), high: Math.exp(Math.log(rr) + 1.96 * se) };
}

export function confidenceOf(low: number, exposures: number, hits: number): Confidence {
  if (low > 1 && exposures >= 10 && hits >= 5) return 'high';
  if (low > 1) return 'medium';
  return 'low';
}

const CONFIDENCE_RANK: Record<Confidence, number> = { high: 2, medium: 1, low: 0 };

export function computeSuspects(input: {
  entries: AnalysisEntry[];
  ingredients: Map<string, IngredientDto>;
  windowMinutes: number;
  outcome: AnalysisOutcome;
  minSeverity: number;
  from: number;
  to: number;
  now: number;
}): {
  ingredients: SuspectDto[];
  allergens: SuspectDto[];
  foodEntries: number;
  censored: number;
  outcomeEvents: number;
} {
  const { entries, windowMinutes, outcome, minSeverity, from, to, now } = input;
  const windowMs = windowMinutes * MINUTE;

  const events = entries
    .filter((entry) => isOutcome(entry, outcome, minSeverity))
    .map((entry) => entry.at)
    .sort((a, b) => a - b);

  const foods: Food[] = [];
  let censored = 0;
  for (const entry of entries) {
    if ((entry.type !== 'meal' && entry.type !== 'drink') || entry.at < from || entry.at > to)
      continue;
    if (entry.at + windowMs > now) {
      censored += 1;
      continue;
    }
    const firstEvent = events.find((at) => at >= entry.at && at <= entry.at + windowMs);
    const ingredientIds = new Set(entry.ingredientIds);
    const allergens = new Set<Allergen>();
    for (const id of ingredientIds) {
      for (const allergen of input.ingredients.get(id)?.allergens ?? []) allergens.add(allergen);
    }
    foods.push({
      at: entry.at,
      ingredientIds,
      allergens,
      lagMinutes: firstEvent === undefined ? null : Math.round((firstEvent - entry.at) / MINUTE),
    });
  }

  const total = foods.length;

  function suspect(
    key: string,
    ingredient: IngredientDto | null,
    allergen: Allergen | null,
    exposed: Food[],
  ): SuspectDto | null {
    const n1 = exposed.length;
    const n0 = total - n1;
    if (n1 < MIN_EXPOSURES || n0 === 0) return null;
    const hits = exposed.filter((food) => food.lagMinutes !== null);
    const a = hits.length;
    if (a < MIN_OUTCOMES) return null;
    const c = foods.filter((food) => !exposed.includes(food) && food.lagMinutes !== null).length;
    const { rr, low, high } = relativeRisk(a, n1, c, n0);
    const lags = hits.map((food) => food.lagMinutes as number);
    const bucketSize = windowMinutes / LAG_BUCKETS;
    const histogram = new Array<number>(LAG_BUCKETS).fill(0);
    for (const lag of lags) {
      histogram[Math.min(LAG_BUCKETS - 1, Math.floor(lag / bucketSize))]! += 1;
    }
    return {
      key,
      ingredient,
      allergen,
      exposures: n1,
      exposuresWithOutcome: a,
      rateExposed: a / n1,
      rateUnexposed: c / n0,
      relativeRisk: rr,
      ciLow: low,
      ciHigh: high,
      confidence: confidenceOf(low, n1, a),
      medianLagMinutes: median(lags),
      lagHistogram: histogram,
      alsoWith: [],
    };
  }

  const rank = (list: SuspectDto[]) =>
    list
      .filter((item) => item.relativeRisk > 1)
      .sort(
        (x, y) =>
          CONFIDENCE_RANK[y.confidence] - CONFIDENCE_RANK[x.confidence] ||
          y.ciLow - x.ciLow ||
          y.relativeRisk - x.relativeRisk,
      )
      .slice(0, 15);

  const groups = new Map<string, IngredientDto[]>();
  for (const [id, ingredient] of input.ingredients) {
    const indices = foods.flatMap((food, index) => (food.ingredientIds.has(id) ? [index] : []));
    if (indices.length < MIN_EXPOSURES) continue;
    const signature = indices.join(',');
    groups.set(signature, [...(groups.get(signature) ?? []), ingredient]);
  }

  const ingredientSuspects: SuspectDto[] = [];
  for (const group of groups.values()) {
    const [first, ...rest] = group.sort((a, b) => a.nameDe.localeCompare(b.nameDe));
    const result = suspect(
      first!.id,
      first!,
      null,
      foods.filter((food) => food.ingredientIds.has(first!.id)),
    );
    if (result) ingredientSuspects.push({ ...result, alsoWith: rest });
  }

  const allergenSuspects: SuspectDto[] = [];
  const allergenKeys = new Set(foods.flatMap((food) => [...food.allergens]));
  for (const allergen of allergenKeys) {
    const result = suspect(
      allergen,
      null,
      allergen,
      foods.filter((food) => food.allergens.has(allergen)),
    );
    if (result) allergenSuspects.push(result);
  }

  return {
    ingredients: rank(ingredientSuspects),
    allergens: rank(allergenSuspects),
    foodEntries: total,
    censored,
    outcomeEvents: events.filter((at) => at >= from && at <= to).length,
  };
}
