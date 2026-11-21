import { loadConfig } from '../config.ts';
import { createDb } from '../db/client.ts';
import { runRetention } from '../services/retention.ts';

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);
try {
  console.log(JSON.stringify(await runRetention(db)));
} finally {
  await pool.end();
}
