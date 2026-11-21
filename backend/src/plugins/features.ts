import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { FeatureKey } from '@foodlog/shared';
import type { Database } from '../db/client.ts';
import { AppError } from '../lib/errors.ts';
import { resolveFeatures } from '../services/features.ts';

declare module 'fastify' {
  interface FastifyInstance {
    requireFeature: (key: FeatureKey) => (request: FastifyRequest) => Promise<void>;
  }
}

export function registerFeatures(app: FastifyInstance, deps: { db: Database }) {
  app.decorate('requireFeature', (key: FeatureKey) => async (request: FastifyRequest) => {
    if (!request.user) throw new AppError(401, 'unauthenticated', 'Authentication required');
    const features = await resolveFeatures(deps.db, request.user.id);
    if (!features[key]) throw new AppError(403, 'feature_disabled', 'This feature is disabled');
  });
}
