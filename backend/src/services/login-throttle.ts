import { eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client.ts';
import { loginAttempts } from '../db/schema.ts';
import { hashToken } from '../lib/crypto.ts';
import { MINUTE } from '../lib/time.ts';

export const LOGIN_MAX_FAILURES = 10;
export const LOGIN_WINDOW = 15 * MINUTE;

// Keyed by the address, not the user row, so unknown addresses are throttled exactly like known ones.
const keyFor = (email: string) => hashToken(email.trim().toLowerCase());

export async function isLoginLocked(db: Database, email: string, now = new Date()) {
  const [row] = await db
    .select()
    .from(loginAttempts)
    .where(eq(loginAttempts.emailHash, keyFor(email)));
  if (!row) return false;
  const windowOpen = now.getTime() - row.windowStartedAt.getTime() < LOGIN_WINDOW;
  return windowOpen && row.failures >= LOGIN_MAX_FAILURES;
}

export async function recordLoginFailure(db: Database, email: string, now = new Date()) {
  const cutoff = new Date(now.getTime() - LOGIN_WINDOW);
  await db
    .insert(loginAttempts)
    .values({ emailHash: keyFor(email), failures: 1, windowStartedAt: now })
    .onDuplicateKeyUpdate({
      // MariaDB evaluates assignments left to right, so failures must be set before the window.
      set: {
        failures: sql`IF(${loginAttempts.windowStartedAt} < ${cutoff}, 1, ${loginAttempts.failures} + 1)`,
        windowStartedAt: sql`IF(${loginAttempts.windowStartedAt} < ${cutoff}, ${now}, ${loginAttempts.windowStartedAt})`,
      },
    });
}

export async function clearLoginFailures(db: Database, email: string) {
  await db.delete(loginAttempts).where(eq(loginAttempts.emailHash, keyFor(email)));
}
