import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { dayRangeUtc, exportQuerySchema, utcToWallTime } from '@foodlog/shared';
import type { AppDeps } from '../app.ts';
import { entries, entryIngredients } from '../db/schema.ts';
import { toCsv } from '../lib/csv.ts';
import { parseBody } from '../lib/errors.ts';
import { loadIngredientsById } from '../services/ingredients.ts';

const HEADER = [
  'local_time',
  'utc_time',
  'type',
  'title',
  'ingredients',
  'allergens',
  'symptom_type',
  'severity',
  'bristol',
  'sleep_minutes',
  'rating',
  'note',
];

export async function exportRoutes(app: FastifyInstance, { db }: AppDeps) {
  app.get(
    '/api/export/entries.csv',
    { preHandler: [app.requireUser, app.requireFeature('data_export')] },
    async (request, reply) => {
      const { from, to } = parseBody(exportQuerySchema, request.query);
      const user = request.user!;
      const start = dayRangeUtc(from, user.timezone).from;
      const end = dayRangeUtc(to, user.timezone).to;

      const rows = await db
        .select()
        .from(entries)
        .where(
          and(
            eq(entries.userId, user.id),
            gte(entries.occurredAt, start),
            lt(entries.occurredAt, end),
          ),
        )
        .orderBy(asc(entries.occurredAt), asc(entries.createdAt));
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

      const lines = rows.map((row) => {
        const linked = links
          .filter((link) => link.entryId === row.id)
          .map((link) => ingredients.get(link.ingredientId))
          .filter((ingredient) => ingredient !== undefined);
        const names = linked
          .map((ingredient) => (user.locale === 'de' ? ingredient.nameDe : ingredient.nameEn))
          .sort((a, b) => a.localeCompare(b, user.locale));
        const allergens = [...new Set(linked.flatMap((ingredient) => ingredient.allergens))].sort();
        return [
          utcToWallTime(row.occurredAt, user.timezone).replace('T', ' '),
          row.occurredAt.toISOString(),
          row.type,
          row.title,
          names.join('; '),
          allergens.join('; '),
          row.symptomType,
          row.severity,
          row.bristol,
          row.sleepMinutes,
          row.rating,
          row.note,
        ];
      });

      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="foodlog-${from}_${to}.csv"`)
        .header('cache-control', 'no-store')
        .send(toCsv([HEADER, ...lines]));
    },
  );
}
