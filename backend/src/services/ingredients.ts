import { and, count, eq, inArray, isNull, like, or, sql } from 'drizzle-orm';
import { type Allergen, type CustomIngredientDto, type IngredientDto } from '@foodlog/shared';
import type { Database } from '../db/client.ts';
import {
  entryIngredients,
  ingredientAllergens,
  ingredientNames,
  ingredients,
} from '../db/schema.ts';

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function visibleTo(userId: string) {
  return or(isNull(ingredients.userId), eq(ingredients.userId, userId));
}

export async function toIngredientDtos(
  db: Database,
  rows: (typeof ingredients.$inferSelect)[],
): Promise<IngredientDto[]> {
  if (rows.length === 0) return [];
  const allergenRows = await db
    .select()
    .from(ingredientAllergens)
    .where(
      inArray(
        ingredientAllergens.ingredientId,
        rows.map((row) => row.id),
      ),
    );
  const nameRows = await db
    .select()
    .from(ingredientNames)
    .where(
      inArray(
        ingredientNames.ingredientId,
        rows.map((row) => row.id),
      ),
    );
  const byIngredient = new Map<string, Allergen[]>();
  for (const row of allergenRows) {
    const list = byIngredient.get(row.ingredientId) ?? [];
    list.push(row.allergen as Allergen);
    byIngredient.set(row.ingredientId, list);
  }
  const namesByIngredient = new Map<string, Record<string, string>>();
  for (const row of nameRows) {
    const names = namesByIngredient.get(row.ingredientId) ?? {};
    names[row.locale] = row.name;
    namesByIngredient.set(row.ingredientId, names);
  }
  return rows.map((row) => ({
    id: row.id,
    names: namesByIngredient.get(row.id) ?? {},
    custom: row.userId !== null,
    allergens: (byIngredient.get(row.id) ?? []).sort(),
  }));
}

export async function loadIngredientsById(
  db: Database,
  ids: string[],
): Promise<Map<string, IngredientDto>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select().from(ingredients).where(inArray(ingredients.id, ids));
  const dtos = await toIngredientDtos(db, rows);
  return new Map(dtos.map((dto) => [dto.id, dto]));
}

export async function allVisible(db: Database, userId: string, ids: string[]): Promise<boolean> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return true;
  const rows = await db
    .select({ id: ingredients.id })
    .from(ingredients)
    .where(and(inArray(ingredients.id, unique), visibleTo(userId)));
  return rows.length === unique.length;
}

// Ingredients that have a name in any language matching the condition.
function withName(condition: ReturnType<typeof like>) {
  return sql`${ingredients.id} IN (SELECT ${ingredientNames.ingredientId} FROM ${ingredientNames} WHERE ${condition})`;
}

// The name shown for a language, with the same fallbacks as `localizedName`.
function displayName(locale: string) {
  return sql<string>`(SELECT ${ingredientNames.name} FROM ${ingredientNames} WHERE ${ingredientNames.ingredientId} = ${ingredients.id} ORDER BY ${ingredientNames.locale} = ${locale} DESC, ${ingredientNames.locale} = 'en' DESC, ${ingredientNames.locale} = 'und' DESC, ${ingredientNames.locale} LIMIT 1)`;
}

export async function searchIngredients(
  db: Database,
  userId: string,
  query: string,
  limit: number,
  locale: string,
  scope: 'all' | 'catalog' = 'all',
  offset = 0,
): Promise<IngredientDto[]> {
  const pattern = `%${escapeLike(query)}%`;
  const prefix = `${escapeLike(query)}%`;
  const rows = await db
    .select()
    .from(ingredients)
    .where(
      and(
        scope === 'catalog' ? isNull(ingredients.userId) : visibleTo(userId),
        query ? withName(like(ingredientNames.name, pattern)) : undefined,
      ),
    )
    .orderBy(
      ...(query ? [sql`${withName(like(ingredientNames.name, prefix))} DESC`] : []),
      displayName(locale),
      ingredients.id,
    )
    .limit(limit)
    .offset(offset);
  return toIngredientDtos(db, rows);
}

export async function nameTaken(
  db: Database,
  userId: string,
  name: string,
  exceptId?: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: ingredients.id })
    .from(ingredients)
    .where(and(visibleTo(userId), withName(eq(ingredientNames.name, name))));
  return rows.some((row) => row.id !== exceptId);
}

export async function listCustomIngredients(
  db: Database,
  userId: string,
  locale: string,
): Promise<CustomIngredientDto[]> {
  const rows = await db
    .select()
    .from(ingredients)
    .where(eq(ingredients.userId, userId))
    .orderBy(displayName(locale), ingredients.id);
  if (rows.length === 0) return [];
  const [dtos, counts] = await Promise.all([
    toIngredientDtos(db, rows),
    db
      .select({ ingredientId: entryIngredients.ingredientId, total: count() })
      .from(entryIngredients)
      .where(
        inArray(
          entryIngredients.ingredientId,
          rows.map((row) => row.id),
        ),
      )
      .groupBy(entryIngredients.ingredientId),
  ]);
  const totals = new Map(counts.map((row) => [row.ingredientId, row.total]));
  return dtos.map((dto) => ({ ...dto, entryCount: totals.get(dto.id) ?? 0 }));
}
