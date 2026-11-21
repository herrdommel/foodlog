import { and, asc, eq, gte, lt } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  dayRangeUtc,
  entriesQuerySchema,
  entryInputSchema,
  wallTimeToUtc,
  type EntryInput,
} from '@foodlog/shared';
import type { AppDeps } from '../app.ts';
import { entries, entryIngredients } from '../db/schema.ts';
import { newId } from '../lib/crypto.ts';
import { AppError, parseBody } from '../lib/errors.ts';
import { MINUTE } from '../lib/time.ts';
import { toEntryDtos } from '../services/entries.ts';
import { allVisible } from '../services/ingredients.ts';

function toRow(input: EntryInput, timezone: string) {
  const occurredAt = wallTimeToUtc(input.occurredAt, timezone);
  if (occurredAt.getTime() > Date.now() + 10 * MINUTE) {
    throw new AppError(400, 'future_time', 'Entries cannot be in the future');
  }
  const isFood = input.type === 'meal' || input.type === 'drink';
  return {
    type: input.type,
    occurredAt,
    title: input.type === 'symptom' || input.type === 'stool' ? null : (input.title ?? null),
    note: input.note || null,
    symptomType: input.type === 'symptom' ? input.symptomType : null,
    severity: input.type === 'symptom' ? input.severity : null,
    bristol: input.type === 'stool' ? input.bristol : null,
    ingredientIds: isFood ? [...new Set(input.ingredientIds)] : [],
  };
}

export async function entryRoutes(app: FastifyInstance, { db }: AppDeps) {
  const auth = { preHandler: app.requireUser };

  async function ensureIngredients(userId: string, ids: string[]) {
    if (!(await allVisible(db, userId, ids))) {
      throw new AppError(400, 'invalid_ingredient', 'Unknown ingredient');
    }
  }

  async function ownEntry(userId: string, id: string) {
    const [row] = await db
      .select()
      .from(entries)
      .where(and(eq(entries.id, id), eq(entries.userId, userId)));
    if (!row) throw new AppError(404, 'not_found', 'Entry not found');
    return row;
  }

  app.get('/api/entries', auth, async (request) => {
    const { date } = parseBody(entriesQuerySchema, request.query);
    const user = request.user!;
    const { from, to } = dayRangeUtc(date, user.timezone);
    const rows = await db
      .select()
      .from(entries)
      .where(
        and(eq(entries.userId, user.id), gte(entries.occurredAt, from), lt(entries.occurredAt, to)),
      )
      .orderBy(asc(entries.occurredAt), asc(entries.createdAt));
    return toEntryDtos(db, rows);
  });

  app.post('/api/entries', auth, async (request, reply) => {
    const input = parseBody(entryInputSchema, request.body);
    const user = request.user!;
    const { ingredientIds, ...row } = toRow(input, user.timezone);
    await ensureIngredients(user.id, ingredientIds);
    const id = newId();
    await db.transaction(async (tx) => {
      await tx.insert(entries).values({ id, userId: user.id, ...row });
      if (ingredientIds.length > 0) {
        await tx
          .insert(entryIngredients)
          .values(ingredientIds.map((ingredientId) => ({ entryId: id, ingredientId })));
      }
    });
    const [created] = await db.select().from(entries).where(eq(entries.id, id));
    return reply.status(201).send((await toEntryDtos(db, [created!]))[0]);
  });

  app.put('/api/entries/:id', auth, async (request) => {
    const { id } = request.params as { id: string };
    const input = parseBody(entryInputSchema, request.body);
    const user = request.user!;
    await ownEntry(user.id, id);
    const { ingredientIds, ...row } = toRow(input, user.timezone);
    await ensureIngredients(user.id, ingredientIds);
    await db.transaction(async (tx) => {
      await tx.update(entries).set(row).where(eq(entries.id, id));
      await tx.delete(entryIngredients).where(eq(entryIngredients.entryId, id));
      if (ingredientIds.length > 0) {
        await tx
          .insert(entryIngredients)
          .values(ingredientIds.map((ingredientId) => ({ entryId: id, ingredientId })));
      }
    });
    const [updated] = await db.select().from(entries).where(eq(entries.id, id));
    return (await toEntryDtos(db, [updated!]))[0];
  });

  app.delete('/api/entries/:id', auth, async (request, reply) => {
    const { id } = request.params as { id: string };
    await ownEntry(request.user!.id, id);
    await db.delete(entries).where(eq(entries.id, id));
    return reply.status(204).send();
  });
}
