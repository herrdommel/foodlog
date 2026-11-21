import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { legalDocSchema, localeSchema } from '@foodlog/shared';
import { z } from 'zod';
import type { AppDeps } from '../app.ts';
import { AppError, parseBody } from '../lib/errors.ts';

const MAX_BYTES = 200_000;

export async function legalRoutes(app: FastifyInstance, { config }: AppDeps) {
  app.get('/api/legal/:doc', async (request, reply) => {
    const { doc } = parseBody(z.object({ doc: legalDocSchema }), request.params);
    const { lang } = parseBody(z.object({ lang: localeSchema.default('de') }), request.query);
    const file = resolve(config.LEGAL_DIR, `${doc}.${lang}.md`);
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch {
      throw new AppError(404, 'not_configured', 'This document has not been provided yet');
    }
    if (Buffer.byteLength(text) > MAX_BYTES || text.trim() === '') {
      throw new AppError(404, 'not_configured', 'This document has not been provided yet');
    }
    return reply.header('cache-control', 'public, max-age=300').send({ markdown: text });
  });
}
