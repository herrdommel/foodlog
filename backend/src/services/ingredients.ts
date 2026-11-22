import { and, asc, count, eq, inArray, isNull, like, or, sql } from 'drizzle-orm';
import type { Allergen, CustomIngredientDto, IngredientDto } from '@foodlog/shared';
import type { Database } from '../db/client.ts';
import { entryIngredients, ingredientAllergens, ingredients } from '../db/schema.ts';

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
  const byIngredient = new Map<string, Allergen[]>();
  for (const row of allergenRows) {
    const list = byIngredient.get(row.ingredientId) ?? [];
    list.push(row.allergen as Allergen);
    byIngredient.set(row.ingredientId, list);
  }
  return rows.map((row) => ({
    id: row.id,
    nameDe: row.nameDe,
    nameEn: row.nameEn,
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

export async function searchIngredients(
  db: Database,
  userId: string,
  query: string,
  limit: number,
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
        query
          ? or(like(ingredients.nameDe, pattern), like(ingredients.nameEn, pattern))
          : undefined,
      ),
    )
    .orderBy(
      sql`(${ingredients.nameDe} LIKE ${prefix} OR ${ingredients.nameEn} LIKE ${prefix}) DESC`,
      ingredients.nameDe,
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
    .where(and(visibleTo(userId), or(eq(ingredients.nameDe, name), eq(ingredients.nameEn, name))));
  return rows.some((row) => row.id !== exceptId);
}

export async function listCustomIngredients(
  db: Database,
  userId: string,
): Promise<CustomIngredientDto[]> {
  const rows = await db
    .select()
    .from(ingredients)
    .where(eq(ingredients.userId, userId))
    .orderBy(asc(ingredients.nameDe));
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
