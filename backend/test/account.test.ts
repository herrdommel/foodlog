import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  adminAudit,
  aiKeys,
  aiSettings,
  authTokens,
  entries,
  ingredients,
  oauthAccounts,
  sessions,
  templates,
  userFeatureOverrides,
  users,
} from '../src/db/schema.ts';
import { newId } from '../src/lib/crypto.ts';
import {
  createInvite,
  createTestApp,
  get,
  makeAdmin,
  ORIGIN,
  PASSWORD,
  post,
  registerAndLogin,
  sessionCookie,
  type TestApp,
} from './helpers.ts';

let t: TestApp;
let cookie: string;
let userId: string;

beforeEach(async () => {
  await t?.close();
  t = await createTestApp();
  cookie = await registerAndLogin(t);
  const [user] = await t.db.select().from(users).where(eq(users.email, 'anna@example.com'));
  userId = user!.id;
});

afterAll(async () => {
  await t?.close();
});

async function fillAccount(as = cookie) {
  const milk = (await get(t.app, '/api/ingredients?q=Milch', as)).json()[0].id;
  const tag = (
    await post(t.app, '/api/ingredients', { name: 'Omas Suppe', allergens: ['celery'] }, as)
  ).json();
  await post(
    t.app,
    '/api/entries',
    {
      type: 'meal',
      occurredAt: '2026-01-10T08:00',
      title: 'Müsli',
      ingredientIds: [milk, tag.id],
      note: 'private note',
    },
    as,
  );
  await post(
    t.app,
    '/api/entries',
    { type: 'symptom', occurredAt: '2026-01-10T10:00', symptomType: 'bloating', severity: 6 },
    as,
  );
  await post(
    t.app,
    '/api/templates',
    { name: 'Standard', type: 'meal', title: 'Müsli', ingredientIds: [milk, tag.id] },
    as,
  );
}

describe('registration consent', () => {
  it('requires the privacy consent and records when it was given', async () => {
    const invite = await createInvite(t);
    const base = { name: 'Bob', email: 'bob@example.com', password: PASSWORD, inviteToken: invite };
    for (const body of [
      base,
      { ...base, acceptPrivacy: false },
      { ...base, acceptPrivacy: 'yes' },
    ]) {
      const response = await post(t.app, '/api/auth/register', body);
      expect(response.statusCode, JSON.stringify(body)).toBe(400);
    }
    expect(await t.db.select().from(users).where(eq(users.email, 'bob@example.com'))).toHaveLength(
      0,
    );

    const ok = await post(t.app, '/api/auth/register', { ...base, acceptPrivacy: true });
    expect(ok.statusCode).toBe(202);
    const [bob] = await t.db.select().from(users).where(eq(users.email, 'bob@example.com'));
    expect(Date.now() - bob!.privacyConsentAt!.getTime()).toBeLessThan(60_000);
  });
});

describe('data export', () => {
  it('requires authentication', async () => {
    expect((await get(t.app, '/api/me/export')).statusCode).toBe(401);
  });

  it('contains the data of the user and nothing from other users', async () => {
    await fillAccount();
    const bob = await registerAndLogin(t, 'bob@example.com', 'Bob');
    await fillAccount(bob);

    const response = await get(t.app, '/api/me/export', cookie);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="foodlog-export-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    expect(response.headers['cache-control']).toBe('no-store');

    const data = response.json();
    expect(data.exportVersion).toBe(1);
    expect(data.profile).toMatchObject({
      name: 'Anna',
      email: 'anna@example.com',
      locale: 'de',
      timezone: 'Europe/Berlin',
      emailVerified: true,
      signInMethods: ['password'],
    });
    expect(data.profile.privacyConsentAt).toBeTruthy();
    expect(data.entries).toHaveLength(2);
    expect(data.entries[0]).toMatchObject({ type: 'meal', title: 'Müsli', note: 'private note' });
    expect(data.entries[0].ingredients.map((i: { name: string }) => i.name).sort()).toEqual([
      'Milk',
      'Omas Suppe',
    ]);
    expect(data.entries[1]).toMatchObject({
      type: 'symptom',
      symptomType: 'bloating',
      severity: 6,
    });
    expect(data.customIngredients).toEqual([{ name: 'Omas Suppe', allergens: ['celery'] }]);
    expect(data.templates).toEqual([
      {
        name: 'Standard',
        type: 'meal',
        title: 'Müsli',
        ingredients: expect.arrayContaining(['Milk', 'Omas Suppe']),
      },
    ]);
    expect(JSON.stringify(data)).not.toContain('bob@example.com');
  });

  it('contains no secrets', async () => {
    await t.app.inject({ method: 'GET', url: '/api/health' });
    const [row] = await t.db.select().from(users).where(eq(users.id, userId));
    await t.db.insert(aiKeys).values({
      userId,
      provider: 'anthropic',
      ciphertext: 'v1.k.iv.tag.SECRETCIPHER',
      last4: '1234',
    });
    await t.db.insert(authTokens).values({
      id: newId(),
      userId,
      type: 'reset_password',
      tokenHash: 'TOKENHASH123',
      expiresAt: new Date(Date.now() + 1000),
    });

    const text = (await get(t.app, '/api/me/export', cookie)).body;
    for (const secret of [
      row!.passwordHash!,
      '$argon2',
      'SECRETCIPHER',
      'TOKENHASH123',
      'ciphertext',
      'passwordHash',
      cookie.split('=')[1]!,
    ]) {
      expect(text, secret).not.toContain(secret);
    }
    expect(JSON.parse(text).aiSettings.storedKeys).toEqual([
      { provider: 'anthropic', endsIn: '1234', storedAt: expect.any(String) },
    ]);
  });

  it('includes the consent for photos', async () => {
    const at = new Date('2026-11-01T10:00:00.000Z');
    await t.db.insert(aiSettings).values({ userId, photoConsentVersion: 1, photoConsentAt: at });
    const body = (await get(t.app, '/api/me/export', cookie)).json();
    expect(body.aiSettings).toMatchObject({
      photoConsentVersion: 1,
      photoConsentAt: at.toISOString(),
    });
  });

  it('is not blocked by the data export feature switch', async () => {
    await t.db.insert(userFeatureOverrides).values({ userId, key: 'data_export', enabled: false });
    expect(
      (await get(t.app, '/api/export/entries.csv?from=2026-01-01&to=2026-01-31', cookie))
        .statusCode,
    ).toBe(403);
    const response = await get(t.app, '/api/me/export', cookie);
    expect(response.statusCode).toBe(200);
    expect(response.json().featureOverrides).toEqual([{ feature: 'data_export', enabled: false }]);
  });

  it('lists sign-in methods and actions taken by administrators without naming them', async () => {
    await t.db.insert(oauthAccounts).values({ provider: 'google', providerUserId: 'g-1', userId });
    const admin = await registerAndLogin(t, 'admin@example.com', 'Admin');
    await makeAdmin(t, 'admin@example.com');
    const adminSession = sessionCookie(
      await post(t.app, '/api/auth/login', { email: 'admin@example.com', password: PASSWORD }),
    );
    await t.app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${userId}`,
      payload: { name: 'Anna B' },
      headers: { origin: ORIGIN, cookie: adminSession },
    });
    void admin;
    const data = (await get(t.app, '/api/me/export', cookie)).json();
    expect(data.profile.signInMethods).toEqual(['password', 'google']);
    expect(data.actionsByAdministrators).toEqual([
      { action: 'user.rename', detail: null, at: expect.any(String) },
    ]);
    expect(JSON.stringify(data)).not.toContain('admin@example.com');
  });
});

describe('account deletion', () => {
  const del = (body: unknown, as = cookie) => post(t.app, '/api/me/delete', body, as);

  it('requires authentication, the matching email and the password', async () => {
    expect(
      (
        await post(t.app, '/api/me/delete', {
          confirmEmail: 'anna@example.com',
          password: PASSWORD,
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (await del({ confirmEmail: 'other@example.com', password: PASSWORD })).json().error.code,
    ).toBe('email_mismatch');
    expect((await del({ confirmEmail: 'anna@example.com' })).json().error.code).toBe(
      'invalid_password',
    );
    expect(
      (await del({ confirmEmail: 'anna@example.com', password: 'wrong password!' })).json().error
        .code,
    ).toBe('invalid_password');
    expect((await get(t.app, '/api/me', cookie)).statusCode).toBe(200);
  });

  it('removes the account with all its data and ends the session', async () => {
    await fillAccount();
    await t.db
      .insert(aiKeys)
      .values({ userId, provider: 'openai', ciphertext: 'v1.k.iv.tag.x', last4: '1234' });
    const bob = await registerAndLogin(t, 'bob@example.com', 'Bob');
    await fillAccount(bob);

    const response = await del({ confirmEmail: 'Anna@Example.com', password: PASSWORD });
    expect(response.statusCode).toBe(204);
    expect(response.cookies.find((c) => c.name === 'foodlog_session')?.value).toBe('');

    expect((await get(t.app, '/api/me', cookie)).statusCode).toBe(401);
    expect(await t.db.select().from(users).where(eq(users.id, userId))).toHaveLength(0);
    expect(await t.db.select().from(entries).where(eq(entries.userId, userId))).toHaveLength(0);
    expect(
      await t.db.select().from(ingredients).where(eq(ingredients.userId, userId)),
    ).toHaveLength(0);
    expect(await t.db.select().from(templates).where(eq(templates.userId, userId))).toHaveLength(0);
    expect(await t.db.select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(0);
    expect(await t.db.select().from(authTokens).where(eq(authTokens.userId, userId))).toHaveLength(
      0,
    );
    expect(await t.db.select().from(aiKeys).where(eq(aiKeys.userId, userId))).toHaveLength(0);

    expect((await get(t.app, '/api/entries?date=2026-01-10', bob)).json()).toHaveLength(2);
    expect(
      (await post(t.app, '/api/auth/login', { email: 'anna@example.com', password: PASSWORD }))
        .statusCode,
    ).toBe(401);
  });

  it('lets users without a password (Google) delete with the email alone', async () => {
    await t.db.update(users).set({ passwordHash: null }).where(eq(users.id, userId));
    expect((await del({ confirmEmail: 'anna@example.com' })).statusCode).toBe(204);
  });

  it('keeps the activity log but drops the reference to the deleted account', async () => {
    await registerAndLogin(t, 'admin@example.com', 'Admin');
    await makeAdmin(t, 'admin@example.com');
    const adminSession = sessionCookie(
      await post(t.app, '/api/auth/login', { email: 'admin@example.com', password: PASSWORD }),
    );
    await t.app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${userId}`,
      payload: { name: 'Anna B' },
      headers: { origin: ORIGIN, cookie: adminSession },
    });
    await del({ confirmEmail: 'anna@example.com', password: PASSWORD });
    const log = (await get(t.app, '/api/admin/audit', adminSession)).json();
    expect(log).toHaveLength(1);
    expect(log[0].targetUser).toBeNull();
    const [raw] = await t.db.select().from(adminAudit);
    expect(raw?.targetUserId).toBeNull();
  });

  it('does not let the last administrator delete the account', async () => {
    await makeAdmin(t, 'anna@example.com');
    const blocked = await del({ confirmEmail: 'anna@example.com', password: PASSWORD });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe('last_admin');
    expect((await get(t.app, '/api/me', cookie)).statusCode).toBe(200);

    await registerAndLogin(t, 'second@example.com', 'Second');
    await makeAdmin(t, 'second@example.com');
    expect((await del({ confirmEmail: 'anna@example.com', password: PASSWORD })).statusCode).toBe(
      204,
    );
  });

  it('counts only active administrators for the last-admin rule', async () => {
    await makeAdmin(t, 'anna@example.com');
    await registerAndLogin(t, 'second@example.com', 'Second');
    await makeAdmin(t, 'second@example.com');
    await t.db.update(users).set({ active: false }).where(eq(users.email, 'second@example.com'));
    expect(
      (await del({ confirmEmail: 'anna@example.com', password: PASSWORD })).json().error.code,
    ).toBe('last_admin');
  });

  it('every foreign key to the users table removes or detaches rows (checked in the database)', async () => {
    const [rows] = await t.pool.query(
      `SELECT TABLE_NAME AS tableName, CONSTRAINT_NAME AS name, DELETE_RULE AS rule
       FROM information_schema.REFERENTIAL_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME = 'users'`,
    );
    const constraints = rows as { tableName: string; name: string; rule: string }[];
    expect(constraints.length).toBeGreaterThan(10);
    const bad = constraints.filter((c) => !['CASCADE', 'SET NULL'].includes(c.rule));
    expect(bad).toEqual([]);

    const personal = [
      'entries',
      'ingredients',
      'templates',
      'sessions',
      'auth_tokens',
      'ai_keys',
      'ai_settings',
      'oauth_accounts',
      'user_avatars',
      'user_feature_overrides',
    ];
    for (const table of personal) {
      expect(
        constraints.some((c) => c.tableName === table && c.rule === 'CASCADE'),
        table,
      ).toBe(true);
    }
  });
});
