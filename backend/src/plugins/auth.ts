import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from '../config.ts';
import type { Database } from '../db/client.ts';
import { clearSessionCookie, SESSION_COOKIE } from '../lib/cookies.ts';
import { AppError } from '../lib/errors.ts';
import { findSessionUser } from '../services/sessions.ts';
import type { UserRow } from '../services/users.ts';

declare module 'fastify' {
  interface FastifyRequest {
    user: UserRow | null;
    sessionId: string | null;
  }
  interface FastifyInstance {
    requireUser: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export function registerAuth(app: FastifyInstance, deps: { config: Config; db: Database }) {
  const { config, db } = deps;
  app.decorateRequest('user', null);
  app.decorateRequest('sessionId', null);

  app.addHook('onRequest', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) return;
    const found = await findSessionUser(db, token);
    if (!found) {
      clearSessionCookie(reply, config);
      return;
    }
    request.user = found.user;
    request.sessionId = found.sessionId;
  });

  app.decorate('requireUser', async (request: FastifyRequest) => {
    if (!request.user) throw new AppError(401, 'unauthenticated', 'Authentication required');
  });

  app.decorate('requireAdmin', async (request: FastifyRequest) => {
    if (!request.user) throw new AppError(401, 'unauthenticated', 'Authentication required');
    if (request.user.role !== 'admin') throw new AppError(403, 'forbidden', 'Admin only');
  });
}
