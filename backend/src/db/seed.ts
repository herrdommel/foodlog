import { loadConfig } from '../config.ts';
import { createDb } from './client.ts';

const config = loadConfig();
const { pool } = createDb(config.DATABASE_URL);

await pool.end();
