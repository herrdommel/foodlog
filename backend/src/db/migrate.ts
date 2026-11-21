import { migrate } from 'drizzle-orm/mysql2/migrator';
import { loadConfig } from '../config.ts';
import { createDb } from './client.ts';

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);

try {
  await migrate(db, { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname });
} finally {
  await pool.end();
}
