import Fastify from 'fastify';
import type { Config } from './config.ts';
import type { Database } from './db/client.ts';

export interface AppDeps {
  config: Config;
  db: Database;
}

export function buildApp({ config }: AppDeps) {
  const app = Fastify({
    logger:
      config.NODE_ENV === 'test'
        ? false
        : { level: config.NODE_ENV === 'production' ? 'info' : 'debug' },
  });

  app.get('/api/health', async () => ({ status: 'ok' }));

  return app;
}
