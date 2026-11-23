import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  adminAudit,
  authTokens,
  invites,
  loginAttempts,
  sessions,
  users,
} from '../src/db/schema.ts';
import { hashToken, newId, newToken } from '../src/lib/crypto.ts';
import { DAY } from '../src/lib/time.ts';
import { runRetention, startRetentionJob } from '../src/services/retention.ts';
import { createTestApp, type TestApp } from './helpers.ts';

let t: TestApp;
const now = new Date('2026-06-01T12:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * DAY);
const ahead = (days: number) => new Date(now.getTime() + days * DAY);

beforeEach(async () => {
  await t?.close();
  t = await createTestApp();
});

afterAll(async () => {
  await t?.close();
});

async function user() {
  const id = newId();
  await t.db.insert(users).values({ id, email: `${id}@example.com`, name: 'U' });
  return id;
}

async function invite(values: Partial<typeof invites.$inferInsert>) {
  const id = newId();
  await t.db.insert(invites).values({
    id,
    tokenHash: hashToken(newToken()),
    expiresAt: ahead(5),
    ...values,
  });
  return id;
}

describe('runRetention', () => {
  it('removes expired and used tokens after a grace period only', async () => {
    const userId = await user();
    const token = (values: Partial<typeof authTokens.$inferInsert>) =>
      t.db.insert(authTokens).values({
        id: newId(),
        userId,
        type: 'reset_password',
        tokenHash: hashToken(newToken()),
        expiresAt: ahead(1),
        ...values,
      });
    await token({ expiresAt: ago(8) });
    await token({ expiresAt: ago(2) });
    await token({ usedAt: ago(8), expiresAt: ahead(1) });
    await token({ usedAt: ago(1), expiresAt: ahead(1) });
    await token({});

    const result = await runRetention(t.db, now);
    expect(result.tokens).toBe(2);
    expect(await t.db.select().from(authTokens)).toHaveLength(3);
  });

  it('removes expired sessions', async () => {
    const userId = await user();
    await t.db.insert(sessions).values([
      { id: hashToken(newToken()), userId, expiresAt: ago(1) },
      { id: hashToken(newToken()), userId, expiresAt: ahead(1) },
    ]);
    const result = await runRetention(t.db, now);
    expect(result.sessions).toBe(1);
    expect(await t.db.select().from(sessions)).toHaveLength(1);
  });

  it('forgets invited email addresses of finished invitations, then deletes the invitations', async () => {
    const openId = await invite({ email: 'open@example.com', expiresAt: ahead(3) });
    const freshUsed = await invite({ email: 'fresh@example.com', usedAt: ago(2) });
    const oldUsed = await invite({ email: 'old@example.com', usedAt: ago(10) });
    const oldExpired = await invite({ email: 'expired@example.com', expiresAt: ago(10) });
    const veryOld = await invite({ email: 'ancient@example.com', usedAt: ago(100) });

    const result = await runRetention(t.db, now);
    expect(result.inviteEmails).toBe(3);
    expect(result.invites).toBe(1);

    const rows = new Map((await t.db.select().from(invites)).map((row) => [row.id, row]));
    expect(rows.get(openId)?.email).toBe('open@example.com');
    expect(rows.get(freshUsed)?.email).toBe('fresh@example.com');
    expect(rows.get(oldUsed)?.email).toBeNull();
    expect(rows.get(oldExpired)?.email).toBeNull();
    expect(rows.has(veryOld)).toBe(false);
  });

  it('removes activity log entries older than a year', async () => {
    const actorId = await user();
    await t.db.insert(adminAudit).values([
      { id: newId(), actorId, action: 'old', createdAt: ago(400) },
      { id: newId(), actorId, action: 'recent', createdAt: ago(100) },
    ]);
    const result = await runRetention(t.db, now);
    expect(result.audit).toBe(1);
    expect((await t.db.select().from(adminAudit)).map((row) => row.action)).toEqual(['recent']);
  });

  it('removes login attempt counters after a day', async () => {
    await t.db.insert(loginAttempts).values([
      { emailHash: 'a'.repeat(64), failures: 4, windowStartedAt: ago(2) },
      { emailHash: 'b'.repeat(64), failures: 1, windowStartedAt: ago(0.1) },
    ]);
    const result = await runRetention(t.db, now);
    expect(result.loginAttempts).toBe(1);
    expect((await t.db.select().from(loginAttempts)).map((row) => row.emailHash)).toEqual([
      'b'.repeat(64),
    ]);
  });

  it('is idempotent and reports nothing to do on an empty database', async () => {
    expect(await runRetention(t.db, now)).toEqual({
      tokens: 0,
      sessions: 0,
      inviteEmails: 0,
      invites: 0,
      audit: 0,
      loginAttempts: 0,
      challenges: 0,
    });
  });
});

describe('startRetentionJob', () => {
  it('runs after the start delay and then on the interval, and can be stopped', async () => {
    vi.useFakeTimers();
    try {
      const run = vi.fn().mockResolvedValue(undefined);
      const stop = startRetentionJob({
        run,
        onError: vi.fn(),
        startDelayMs: 1000,
        intervalMs: 5000,
      });
      expect(run).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1000);
      expect(run).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(5000);
      expect(run).toHaveBeenCalledTimes(2);
      stop();
      await vi.advanceTimersByTimeAsync(20_000);
      expect(run).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports failures without stopping the job', async () => {
    vi.useFakeTimers();
    try {
      const failure = new Error('database gone');
      const run = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined);
      const onError = vi.fn();
      const stop = startRetentionJob({ run, onError, startDelayMs: 10, intervalMs: 100 });
      await vi.advanceTimersByTimeAsync(10);
      expect(onError).toHaveBeenCalledWith(failure);
      await vi.advanceTimersByTimeAsync(100);
      expect(run).toHaveBeenCalledTimes(2);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
