import type { FastifyInstance } from 'fastify';
import { analysisQuerySchema, type AnalysisDto } from '@foodlog/shared';
import type { AppDeps } from '../app.ts';
import { parseBody } from '../lib/errors.ts';
import { buildAnalysis } from '../services/analysis-report.ts';

export async function analysisRoutes(app: FastifyInstance, { db }: AppDeps) {
  app.get('/api/analysis', { preHandler: app.requireUser }, async (request): Promise<AnalysisDto> =>
    buildAnalysis(db, request.user!, parseBody(analysisQuerySchema, request.query)),
  );
}
