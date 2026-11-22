import { and, inArray, isNull, or, eq } from 'drizzle-orm';
import type { Allergen, IngredientDto, IngredientSuggestionsDto } from '@foodlog/shared';
import type { Database } from '../db/client.ts';
import { ingredients } from '../db/schema.ts';
import { NAME_ALLERGENS } from '../catalog/open-food-facts.ts';
import { toIngredientDtos } from './ingredients.ts';

export interface Candidate {
  catalogKey: string | null;
  name: string;
  allergens: Allergen[];
}

const MAX_NAME = 60;

export function allergensFromName(value: string): Allergen[] {
  const lower = value.toLowerCase();
  return NAME_ALLERGENS.flatMap(([pattern, allergens]) => (pattern.test(lower) ? allergens : []));
}

export function cleanName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!name || name.length > MAX_NAME || /[\d%()[\]{}<>]/.test(name)) return null;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// Known entries are taken as they are, anything else becomes a proposal that the user confirms.
export async function resolveCandidates(
  db: Database,
  userId: string,
  candidates: Candidate[],
): Promise<IngredientSuggestionsDto> {
  const keys = [...new Set(candidates.flatMap((c) => (c.catalogKey ? [c.catalogKey] : [])))];
  const names = [...new Set(candidates.map((c) => c.name))];
  const rows =
    keys.length === 0 && names.length === 0
      ? []
      : await db
          .select()
          .from(ingredients)
          .where(
            and(
              or(isNull(ingredients.userId), eq(ingredients.userId, userId)),
              or(
                keys.length > 0 ? inArray(ingredients.catalogKey, keys) : undefined,
                names.length > 0 ? inArray(ingredients.nameDe, names) : undefined,
                names.length > 0 ? inArray(ingredients.nameEn, names) : undefined,
              ),
            ),
          );
  const dtos = new Map((await toIngredientDtos(db, rows)).map((dto) => [dto.id, dto]));
  const byKey = new Map(rows.flatMap((row) => (row.catalogKey ? [[row.catalogKey, row.id]] : [])));
  const byName = new Map<string, string>();
  for (const row of rows) {
    for (const name of [row.nameDe, row.nameEn]) {
      const known = byName.get(name.toLowerCase());
      if (!known || row.userId === null) byName.set(name.toLowerCase(), row.id);
    }
  }

  const matched = new Map<string, IngredientDto>();
  const proposed = new Map<string, IngredientSuggestionsDto['proposed'][number]>();
  for (const candidate of candidates) {
    const id =
      (candidate.catalogKey ? byKey.get(candidate.catalogKey) : undefined) ??
      byName.get(candidate.name.toLowerCase());
    const dto = id ? dtos.get(id) : undefined;
    if (dto) {
      matched.set(dto.id, dto);
    } else if (!proposed.has(candidate.name.toLowerCase())) {
      proposed.set(candidate.name.toLowerCase(), {
        name: candidate.name,
        allergens: [...new Set(candidate.allergens)].sort(),
        source: 'ingredient',
      });
    }
  }
  return { matched: [...matched.values()], proposed: [...proposed.values()] };
}
