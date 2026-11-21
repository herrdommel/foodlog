import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { oauthAccounts, users } from '../src/db/schema.ts';
import { newId } from '../src/lib/crypto.ts';
import { hashPassword } from '../src/lib/password.ts';
import { PUBLIC_REGISTRATION, setBooleanSetting } from '../src/services/settings.ts';
import { createTestApp, get, ORIGIN, type TestApp } from './helpers.ts';

let t: TestApp;

afterEach(async () => {
  await t?.close();
});

function stubGoogle(profile: Record<string, unknown>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('oauth2.googleapis.com/token')) {
      return Response.json({ access_token: 'access' });
    }
    if (url.includes('openidconnect.googleapis.com')) return Response.json(profile);
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
}

const google = { GOOGLE_CLIENT_ID: 'client', GOOGLE_CLIENT_SECRET: 'secret' };

async function startFlow(options: { invite?: string; consent?: boolean } = { consent: true }) {
  const parameters = new URLSearchParams();
  if (options.invite) parameters.set('invite', options.invite);
  if (options.consent) parameters.set('consent', '1');
  const query = parameters.size > 0 ? `?${parameters}` : '';
  const start = await get(t.app, `/api/auth/google${query}`);
  const location = new URL(start.headers.location as string);
  const cookies = start.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  return { start, location, cookies, state: location.searchParams.get('state')! };
}

async function callback(cookies: string, state: string) {
  return get(t.app, `/api/auth/google/callback?code=abc&state=${state}`, cookies);
}

describe('google sign-in', () => {
  it('is not available without credentials', async () => {
    t = await createTestApp();
    expect((await get(t.app, '/api/auth/google')).statusCode).toBe(404);
    expect((await get(t.app, '/api/auth/config')).json().googleLogin).toBe(false);
  });

  it('redirects to Google with PKCE and state', async () => {
    t = await createTestApp(google);
    const { start, location } = await startFlow();
    expect(start.statusCode).toBe(302);
    expect(location.origin + location.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/api/auth/google/callback`);
    expect((await get(t.app, '/api/auth/config')).json().googleLogin).toBe(true);
  });

  it('creates a verified user when public registration is on', async () => {
    t = await createTestApp(
      google,
      stubGoogle({ sub: 'g1', email: 'New@Example.com', email_verified: true, name: 'New User' }),
    );
    await setBooleanSetting(t.db, PUBLIC_REGISTRATION, true);
    const { cookies, state } = await startFlow();
    const response = await callback(cookies, state);
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(`${ORIGIN}/`);
    const sessionCookie = response.cookies.find((c) => c.name === 'foodlog_session');
    expect(sessionCookie).toBeDefined();

    const [user] = await t.db.select().from(users).where(eq(users.email, 'new@example.com'));
    expect(user?.emailVerifiedAt).not.toBeNull();
    expect(user?.privacyConsentAt).not.toBeNull();
    expect(user?.passwordHash).toBeNull();
    const me = await get(t.app, '/api/me', `foodlog_session=${sessionCookie!.value}`);
    expect(me.json().user).toMatchObject({ googleLinked: true, hasPassword: false });
  });

  it('refuses new users when registration is closed', async () => {
    t = await createTestApp(
      google,
      stubGoogle({ sub: 'g1', email: 'new@example.com', email_verified: true }),
    );
    const { cookies, state } = await startFlow();
    const response = await callback(cookies, state);
    expect(response.headers.location).toBe(`${ORIGIN}/login?error=registration_closed`);
  });

  it('does not create a new account without consent to the privacy policy', async () => {
    t = await createTestApp(
      google,
      stubGoogle({ sub: 'g1', email: 'new@example.com', email_verified: true, name: 'New User' }),
    );
    await setBooleanSetting(t.db, PUBLIC_REGISTRATION, true);
    const { cookies, state } = await startFlow({});
    const response = await callback(cookies, state);
    expect(response.headers.location).toBe(`${ORIGIN}/login?error=consent_required`);
    expect(response.cookies.find((c) => c.name === 'foodlog_session')).toBeUndefined();
    expect(await t.db.select().from(users)).toHaveLength(0);
  });

  it('lets existing users sign in with Google without giving consent again', async () => {
    t = await createTestApp(
      google,
      stubGoogle({ sub: 'g1', email: 'old@example.com', email_verified: true }),
    );
    await t.db.insert(users).values({
      id: newId(),
      email: 'old@example.com',
      name: 'Old',
      emailVerifiedAt: new Date(),
    });
    const { cookies, state } = await startFlow({});
    const response = await callback(cookies, state);
    expect(response.headers.location).toBe(`${ORIGIN}/`);
  });

  it('rejects a mismatching state', async () => {
    t = await createTestApp(
      google,
      stubGoogle({ sub: 'g1', email: 'a@example.com', email_verified: true }),
    );
    const { cookies } = await startFlow();
    const response = await callback(cookies, 'forged');
    expect(response.headers.location).toBe(`${ORIGIN}/login?error=google_failed`);
  });

  it('rejects unverified Google emails', async () => {
    t = await createTestApp(
      google,
      stubGoogle({ sub: 'g1', email: 'a@example.com', email_verified: false }),
    );
    await setBooleanSetting(t.db, PUBLIC_REGISTRATION, true);
    const { cookies, state } = await startFlow();
    const response = await callback(cookies, state);
    expect(response.headers.location).toBe(`${ORIGIN}/login?error=google_unverified`);
  });

  it('clears the password of an unverified local account when linking (no takeover)', async () => {
    t = await createTestApp(
      google,
      stubGoogle({ sub: 'g1', email: 'victim@example.com', email_verified: true }),
    );
    const id = newId();
    await t.db.insert(users).values({
      id,
      email: 'victim@example.com',
      name: 'Pre-registered',
      passwordHash: await hashPassword('attacker password'),
    });
    const { cookies, state } = await startFlow();
    const response = await callback(cookies, state);
    expect(response.headers.location).toBe(`${ORIGIN}/`);
    const [user] = await t.db.select().from(users).where(eq(users.id, id));
    expect(user?.passwordHash).toBeNull();
    expect(user?.emailVerifiedAt).not.toBeNull();
    const links = await t.db.select().from(oauthAccounts).where(eq(oauthAccounts.userId, id));
    expect(links).toHaveLength(1);
  });

  it('blocks disabled users', async () => {
    t = await createTestApp(
      google,
      stubGoogle({ sub: 'g1', email: 'off@example.com', email_verified: true }),
    );
    await t.db.insert(users).values({
      id: newId(),
      email: 'off@example.com',
      name: 'Off',
      emailVerifiedAt: new Date(),
      active: false,
    });
    const { cookies, state } = await startFlow();
    const response = await callback(cookies, state);
    expect(response.headers.location).toBe(`${ORIGIN}/login?error=account_disabled`);
    expect(response.cookies.find((c) => c.name === 'foodlog_session')).toBeUndefined();
  });
});
