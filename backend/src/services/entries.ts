import { inArray } from 'drizzle-orm';
import type { EntryDto, SymptomType } from '@foodlog/shared';
import type { Database } from '../db/client.ts';
import { entryIngredients, type entries } from '../db/schema.ts';
import { loadIngredientsById } from './ingredients.ts';

export async function toEntryDtos(
  db: Database,
  rows: (typeof entries.$inferSelect)[],
): Promise<EntryDto[]> {
  if (rows.length === 0) return [];
  const links = await db
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
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    occurredAt: row.occurredAt.toISOString(),
    title: row.title,
    note: row.note,
    symptomType: row.symptomType as SymptomType | null,
    severity: row.severity,
    bristol: row.bristol,
    sleepMinutes: row.sleepMinutes,
    rating: row.rating,
    ingredients: links
      .filter((link) => link.entryId === row.id)
      .map((link) => ingredients.get(link.ingredientId))
      .filter((dto) => dto !== undefined)
      .sort((a, b) => a.nameDe.localeCompare(b.nameDe)),
  }));
}
