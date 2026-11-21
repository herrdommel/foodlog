import { emailSchema } from '@foodlog/shared';
import { loadConfig } from '../config.ts';
import { createDb } from '../db/client.ts';
import { invites } from '../db/schema.ts';
import { hashToken, newId, newToken } from '../lib/crypto.ts';
import { DAY, inFuture } from '../lib/time.ts';

const [rawEmail] = process.argv.slice(2);
const email = rawEmail ? emailSchema.parse(rawEmail) : null;

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);
try {
  const token = newToken();
  await db.insert(invites).values({
    id: newId(),
    tokenHash: hashToken(token),
    email,
    expiresAt: inFuture(14 * DAY),
  });
  console.log(`${config.APP_URL}/register?invite=${token}`);
} finally {
  await pool.end();
}
