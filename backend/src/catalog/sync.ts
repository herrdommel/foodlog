import { eq, inArray } from 'drizzle-orm';
import type { Database } from '../db/client.ts';
import { ingredientAllergens, ingredientNames, ingredients } from '../db/schema.ts';
import { newId } from '../lib/crypto.ts';
import { CATALOG } from './ingredients.ts';
import { CATALOG_NAMES } from './names.ts';

export async function syncCatalog(db: Database): Promise<void> {
  const existing = await db
    .select({ id: ingredients.id, key: ingredients.catalogKey })
    .from(ingredients)
    .where(
      inArray(
        ingredients.catalogKey,
        CATALOG.map(([key]) => key),
      ),
    );
  const idByKey = new Map(existing.map((row) => [row.key, row.id]));

  await db.transaction(async (tx) => {
    for (const [key, allergens] of CATALOG) {
      let id = idByKey.get(key);
      if (id) {
        await tx.delete(ingredientAllergens).where(eq(ingredientAllergens.ingredientId, id));
        await tx.delete(ingredientNames).where(eq(ingredientNames.ingredientId, id));
      } else {
        id = newId();
        await tx.insert(ingredients).values({ id, catalogKey: key });
      }
      const names = Object.entries(CATALOG_NAMES).flatMap(([locale, byKey]) =>
        byKey[key] ? [{ ingredientId: id, locale, name: byKey[key] }] : [],
      );
      await tx.insert(ingredientNames).values(names);
      if (allergens.length > 0) {
        await tx
          .insert(ingredientAllergens)
          .values(allergens.map((allergen) => ({ ingredientId: id, allergen })));
      }
    }
  });
}
