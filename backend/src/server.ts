import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createDb } from './db/client.ts';

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);
const app = buildApp({ config, db });

const shutdown = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: config.PORT, host: config.HOST });
