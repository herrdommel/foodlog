import { migrate } from 'drizzle-orm/mysql2/migrator';
import { createDb } from '../src/db/client.ts';
import { TEST_DATABASE_URL } from './helpers.ts';

export default async function setup() {
  const { db, pool } = createDb(TEST_DATABASE_URL);
  await migrate(db, { migrationsFolder: new URL('../drizzle', import.meta.url).pathname });
  await pool.end();
}
