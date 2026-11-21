import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from '../db/client.ts';
import { authTokens } from '../db/schema.ts';
import { hashToken, newId, newToken } from '../lib/crypto.ts';
import { AppError } from '../lib/errors.ts';
import { inFuture } from '../lib/time.ts';

export type AuthTokenType = typeof authTokens.$inferSelect.type;

export async function createAuthToken(
  db: Database,
  input: { userId: string; type: AuthTokenType; ttlMs: number; newEmail?: string },
): Promise<string> {
  await db
    .delete(authTokens)
    .where(
      and(
        eq(authTokens.userId, input.userId),
        eq(authTokens.type, input.type),
        isNull(authTokens.usedAt),
      ),
    );
  const token = newToken();
  await db.insert(authTokens).values({
    id: newId(),
    userId: input.userId,
    type: input.type,
    tokenHash: hashToken(token),
    newEmail: input.newEmail ?? null,
    expiresAt: inFuture(input.ttlMs),
  });
  return token;
}

export async function consumeAuthToken(db: Database, token: string, type: AuthTokenType) {
  const [row] = await db
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.tokenHash, hashToken(token)), eq(authTokens.type, type)));
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
    throw new AppError(400, 'invalid_token', 'The link is invalid or has expired');
  }
  const [result] = await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(authTokens.id, row.id), isNull(authTokens.usedAt)));
  if (result.affectedRows !== 1) {
    throw new AppError(400, 'invalid_token', 'The link is invalid or has expired');
  }
  return row;
}
