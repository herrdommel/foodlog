import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  ingredientInputSchema,
  ingredientSearchSchema,
  ingredientUpdateSchema,
} from '@foodlog/shared';
import type { AppDeps } from '../app.ts';
import { ingredientAllergens, ingredients } from '../db/schema.ts';
import { newId } from '../lib/crypto.ts';
import { AppError, parseBody } from '../lib/errors.ts';
import {
  listCustomIngredients,
  loadIngredientsById,
  nameTaken,
  searchIngredients,
} from '../services/ingredients.ts';

export async function ingredientRoutes(app: FastifyInstance, { db }: AppDeps) {
  const auth = { preHandler: app.requireUser };

  async function ownIngredient(userId: string, id: string) {
    const [row] = await db
      .select()
      .from(ingredients)
      .where(and(eq(ingredients.id, id), eq(ingredients.userId, userId)));
    if (!row) throw new AppError(404, 'not_found', 'Ingredient not found');
    return row;
  }

  app.get('/api/ingredients', auth, async (request) => {
    const { q, limit, offset, scope } = parseBody(ingredientSearchSchema, request.query);
    return searchIngredients(db, request.user!.id, q, limit, scope, offset);
  });

  app.get('/api/ingredients/mine', auth, async (request) =>
    listCustomIngredients(db, request.user!.id),
  );

  app.post('/api/ingredients', auth, async (request, reply) => {
    const body = parseBody(ingredientInputSchema, request.body);
    const userId = request.user!.id;
    if (await nameTaken(db, userId, body.name)) {
      throw new AppError(409, 'ingredient_exists', 'An ingredient with this name already exists');
    }
    const id = newId();
    await db.transaction(async (tx) => {
      await tx.insert(ingredients).values({ id, userId, nameDe: body.name, nameEn: body.name });
      if (body.allergens.length > 0) {
        await tx
          .insert(ingredientAllergens)
          .values(body.allergens.map((allergen) => ({ ingredientId: id, allergen })));
      }
    });
    const created = (await loadIngredientsById(db, [id])).get(id);
    return reply.status(201).send(created);
  });

  app.patch('/api/ingredients/:id', auth, async (request) => {
    const { id } = request.params as { id: string };
    const body = parseBody(ingredientUpdateSchema, request.body);
    const userId = request.user!.id;
    await ownIngredient(userId, id);
    if (body.name !== undefined && (await nameTaken(db, userId, body.name, id))) {
      throw new AppError(409, 'ingredient_exists', 'An ingredient with this name already exists');
    }
    await db.transaction(async (tx) => {
      if (body.name !== undefined) {
        await tx
          .update(ingredients)
          .set({ nameDe: body.name, nameEn: body.name })
          .where(eq(ingredients.id, id));
      }
      if (body.allergens !== undefined) {
        await tx.delete(ingredientAllergens).where(eq(ingredientAllergens.ingredientId, id));
        if (body.allergens.length > 0) {
          await tx
            .insert(ingredientAllergens)
            .values(body.allergens.map((allergen) => ({ ingredientId: id, allergen })));
        }
      }
    });
    return (await loadIngredientsById(db, [id])).get(id);
  });

  app.delete('/api/ingredients/:id', auth, async (request, reply) => {
    const { id } = request.params as { id: string };
    await ownIngredient(request.user!.id, id);
    await db.delete(ingredients).where(eq(ingredients.id, id));
    return reply.status(204).send();
  });
}
