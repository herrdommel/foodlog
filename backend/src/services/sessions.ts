import { and, eq, ne } from 'drizzle-orm';
import type { Database } from '../db/client.ts';
import { sessions, users } from '../db/schema.ts';
import { hashToken, newToken } from '../lib/crypto.ts';
import { DAY, inFuture } from '../lib/time.ts';

export const SESSION_TTL = 30 * DAY;
const REFRESH_AFTER = DAY;

export async function createSession(db: Database, userId: string): Promise<string> {
  const token = newToken();
  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    expiresAt: inFuture(SESSION_TTL),
  });
  return token;
}

export async function findSessionUser(db: Database, token: string) {
  const id = hashToken(token);
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id));
  if (!row) return null;
  if (row.session.expiresAt.getTime() < Date.now() || !row.user.active) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  if (Date.now() - row.session.lastUsedAt.getTime() > REFRESH_AFTER) {
    await db
      .update(sessions)
      .set({ lastUsedAt: new Date(), expiresAt: inFuture(SESSION_TTL) })
      .where(eq(sessions.id, id));
  }
  return { user: row.user, sessionId: id };
}

export async function deleteSession(db: Database, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

export async function deleteUserSessions(
  db: Database,
  userId: string,
  exceptSessionId?: string,
): Promise<void> {
  await db
    .delete(sessions)
    .where(
      exceptSessionId
        ? and(eq(sessions.userId, userId), ne(sessions.id, exceptSessionId))
        : eq(sessions.userId, userId),
    );
}
