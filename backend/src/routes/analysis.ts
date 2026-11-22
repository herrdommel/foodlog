import type { FastifyInstance } from 'fastify';
import { analysisQuerySchema, type AnalysisDto } from '@foodlog/shared';
import type { AppDeps } from '../app.ts';
import { parseBody } from '../lib/errors.ts';
import { buildAnalysis } from '../services/analysis-report.ts';
import { resolveFeatures } from '../services/features.ts';

export async function analysisRoutes(app: FastifyInstance, { db }: AppDeps) {
  app.get(
    '/api/analysis',
    { preHandler: app.requireUser },
    async (request): Promise<AnalysisDto> => {
      const user = request.user!;
      const analysis = await buildAnalysis(db, user, parseBody(analysisQuerySchema, request.query));
      if ((await resolveFeatures(db, user.id)).context_factors) return analysis;
      return { ...analysis, context: [] };
    },
  );
}
