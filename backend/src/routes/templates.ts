import { asc, eq, and } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { templateInputSchema, type TemplateDto } from '@foodlog/shared';
import type { AppDeps } from '../app.ts';
import { templateIngredients, templates } from '../db/schema.ts';
import { newId } from '../lib/crypto.ts';
import { AppError, parseBody } from '../lib/errors.ts';
import { allVisible, loadIngredientsById } from '../services/ingredients.ts';

export async function templateRoutes(app: FastifyInstance, { db }: AppDeps) {
  const auth = { preHandler: app.requireUser };

  async function toDtos(rows: (typeof templates.$inferSelect)[]): Promise<TemplateDto[]> {
    const links = (
      await Promise.all(
        rows.map((row) =>
          db.select().from(templateIngredients).where(eq(templateIngredients.templateId, row.id)),
        ),
      )
    ).flat();
    const ingredients = await loadIngredientsById(db, [
      ...new Set(links.map((link) => link.ingredientId)),
    ]);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      title: row.title,
      ingredients: links
        .filter((link) => link.templateId === row.id)
        .map((link) => ingredients.get(link.ingredientId))
        .filter((dto) => dto !== undefined),
    }));
  }

  app.get('/api/templates', auth, async (request) => {
    const rows = await db
      .select()
      .from(templates)
      .where(eq(templates.userId, request.user!.id))
      .orderBy(asc(templates.name));
    return toDtos(rows);
  });

  app.post('/api/templates', auth, async (request, reply) => {
    const body = parseBody(templateInputSchema, request.body);
    const userId = request.user!.id;
    const ingredientIds = [...new Set(body.ingredientIds)];
    if (!(await allVisible(db, userId, ingredientIds))) {
      throw new AppError(400, 'invalid_ingredient', 'Unknown ingredient');
    }
    const [duplicate] = await db
      .select({ id: templates.id })
      .from(templates)
      .where(and(eq(templates.userId, userId), eq(templates.name, body.name)));
    if (duplicate) throw new AppError(409, 'template_exists', 'A template with this name exists');
    const id = newId();
    await db.transaction(async (tx) => {
      await tx
        .insert(templates)
        .values({ id, userId, name: body.name, type: body.type, title: body.title ?? null });
      if (ingredientIds.length > 0) {
        await tx
          .insert(templateIngredients)
          .values(ingredientIds.map((ingredientId) => ({ templateId: id, ingredientId })));
      }
    });
    const [created] = await db.select().from(templates).where(eq(templates.id, id));
    return reply.status(201).send((await toDtos([created!]))[0]);
  });

  app.delete('/api/templates/:id', auth, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [row] = await db
      .select()
      .from(templates)
      .where(and(eq(templates.id, id), eq(templates.userId, request.user!.id)));
    if (!row) throw new AppError(404, 'not_found', 'Template not found');
    await db.delete(templates).where(eq(templates.id, id));
    return reply.status(204).send();
  });
}
