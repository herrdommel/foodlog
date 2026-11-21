import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import type { Config } from './config.ts';
import type { Database } from './db/client.ts';
import { AppError } from './lib/errors.ts';
import { registerAuth } from './plugins/auth.ts';
import { authRoutes } from './routes/auth.ts';
import { googleRoutes } from './routes/google.ts';
import { meRoutes } from './routes/me.ts';
import type { Mailer } from './services/mail.ts';

export interface AppDeps {
  config: Config;
  db: Database;
  mailer: Mailer;
  fetch?: typeof fetch;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function buildApp(deps: AppDeps) {
  const { config } = deps;
  const app = Fastify({
    trustProxy: config.NODE_ENV === 'production',
    logger:
      config.NODE_ENV === 'test'
        ? false
        : {
            level: config.NODE_ENV === 'production' ? 'info' : 'debug',
            redact: ['req.headers.cookie', 'req.headers.authorization'],
          },
  });

  await app.register(helmet);
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(multipart, { limits: { fileSize: 2 * 1024 * 1024, files: 1 } });

  const allowedOrigin = new URL(config.APP_URL).origin;
  app.addHook('onRequest', async (request) => {
    if (SAFE_METHODS.has(request.method)) return;
    if (request.headers.origin !== allowedOrigin) {
      throw new AppError(403, 'invalid_origin', 'Cross-origin request rejected');
    }
  });

  app.setErrorHandler((error: Error & { statusCode?: number; code?: string }, request, reply) => {
    if (error instanceof AppError) {
      return reply
        .status(error.statusCode)
        .send({ error: { code: error.code, message: error.message } });
    }
    if (error.statusCode === 429) {
      return reply
        .status(429)
        .send({ error: { code: 'rate_limited', message: 'Too many requests' } });
    }
    if (error.statusCode && error.statusCode < 500) {
      return reply.status(error.statusCode).send({
        error: { code: error.code ?? 'bad_request', message: error.message },
      });
    }
    request.log.error(error);
    return reply
      .status(500)
      .send({ error: { code: 'internal_error', message: 'Internal server error' } });
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({ error: { code: 'not_found', message: 'Not found' } }),
  );

  registerAuth(app, deps);

  app.get('/api/health', async () => ({ status: 'ok' }));

  await app.register(authRoutes, deps);
  await app.register(meRoutes, deps);
  await app.register(googleRoutes, deps);

  return app;
}
