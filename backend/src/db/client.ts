import { drizzle } from 'drizzle-orm/mysql2';
import { createPool } from 'mysql2/promise';
import * as schema from './schema.ts';

export function createDb(databaseUrl: string) {
  const pool = createPool({ uri: databaseUrl, connectionLimit: 10 });
  return { db: drizzle(pool, { schema, mode: 'default' }), pool };
}

export type Database = ReturnType<typeof createDb>['db'];
