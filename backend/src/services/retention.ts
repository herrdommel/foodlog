import { and, isNotNull, isNull, lt, or } from 'drizzle-orm';
import type { Database } from '../db/client.ts';
import { adminAudit, authTokens, invites, loginAttempts, sessions } from '../db/schema.ts';
import { DAY } from '../lib/time.ts';

export const RETENTION = {
  tokenDays: 7,
  inviteEmailDays: 7,
  inviteDays: 90,
  auditDays: 365,
  loginAttemptDays: 1,
} as const;

export interface RetentionResult {
  tokens: number;
  sessions: number;
  inviteEmails: number;
  invites: number;
  audit: number;
  loginAttempts: number;
}

function affected(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  return (header as { affectedRows?: number } | undefined)?.affectedRows ?? 0;
}

export async function runRetention(db: Database, now = new Date()): Promise<RetentionResult> {
  const before = (days: number) => new Date(now.getTime() - days * DAY);

  const tokens = await db
    .delete(authTokens)
    .where(
      or(
        lt(authTokens.expiresAt, before(RETENTION.tokenDays)),
        and(isNotNull(authTokens.usedAt), lt(authTokens.usedAt, before(RETENTION.tokenDays))),
      ),
    );

  const expiredSessions = await db.delete(sessions).where(lt(sessions.expiresAt, now));

  const finishedBefore = (days: number) =>
    or(
      and(isNotNull(invites.usedAt), lt(invites.usedAt, before(days))),
      and(isNull(invites.usedAt), lt(invites.expiresAt, before(days))),
    );

  const inviteEmails = await db
    .update(invites)
    .set({ email: null })
    .where(and(isNotNull(invites.email), finishedBefore(RETENTION.inviteEmailDays)));

  const oldInvites = await db.delete(invites).where(finishedBefore(RETENTION.inviteDays));

  const audit = await db
    .delete(adminAudit)
    .where(lt(adminAudit.createdAt, before(RETENTION.auditDays)));

  const attempts = await db
    .delete(loginAttempts)
    .where(lt(loginAttempts.windowStartedAt, before(RETENTION.loginAttemptDays)));

  return {
    tokens: affected(tokens),
    sessions: affected(expiredSessions),
    inviteEmails: affected(inviteEmails),
    invites: affected(oldInvites),
    audit: affected(audit),
    loginAttempts: affected(attempts),
  };
}

export function startRetentionJob(options: {
  run: () => Promise<unknown>;
  onError: (error: unknown) => void;
  startDelayMs?: number;
  intervalMs?: number;
}): () => void {
  const execute = () => {
    options.run().catch(options.onError);
  };
  const first = setTimeout(execute, options.startDelayMs ?? 60_000);
  const interval = setInterval(execute, options.intervalMs ?? DAY);
  first.unref();
  interval.unref();
  return () => {
    clearTimeout(first);
    clearInterval(interval);
  };
}
