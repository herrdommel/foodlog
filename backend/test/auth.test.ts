import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { loginAttempts, users } from '../src/db/schema.ts';
import {
  isLoginLocked,
  LOGIN_MAX_FAILURES,
  LOGIN_WINDOW,
  recordLoginFailure,
} from '../src/services/login-throttle.ts';
import { setBooleanSetting, PUBLIC_REGISTRATION } from '../src/services/settings.ts';
import {
  createInvite,
  createTestApp,
  get,
  ORIGIN,
  PASSWORD,
  post,
  registerAndLogin,
  sessionCookie,
  tokenFromMail,
  type TestApp,
} from './helpers.ts';

let t: TestApp;

beforeEach(async () => {
  await t?.close();
  t = await createTestApp();
});

afterAll(async () => {
  await t?.close();
});

describe('registration', () => {
  it('rejects registration without invitation when public registration is off', async () => {
    const response = await post(t.app, '/api/auth/register', {
      acceptPrivacy: true,
      name: 'Anna',
      email: 'anna@example.com',
      password: PASSWORD,
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('registration_closed');
  });

  it('allows registration when public registration is on', async () => {
    await setBooleanSetting(t.db, PUBLIC_REGISTRATION, true);
    const response = await post(t.app, '/api/auth/register', {
      acceptPrivacy: true,
      name: 'Anna',
      email: 'anna@example.com',
      password: PASSWORD,
    });
    expect(response.statusCode).toBe(202);
    expect(t.mailer.outbox).toHaveLength(1);
  });

  it('registers with invitation, verifies email and logs in', async () => {
    const invite = await createInvite(t);
    const register = await post(t.app, '/api/auth/register', {
      acceptPrivacy: true,
      name: 'Anna',
      email: 'Anna@Example.com',
      password: PASSWORD,
      locale: 'en',
      inviteToken: invite,
    });
    expect(register.statusCode).toBe(202);
    expect(t.mailer.outbox[0]?.to).toBe('anna@example.com');
    expect(t.mailer.outbox[0]?.subject).toContain('confirm');

    const early = await post(t.app, '/api/auth/login', {
      email: 'anna@example.com',
      password: PASSWORD,
    });
    expect(early.statusCode).toBe(403);
    expect(early.json().error.code).toBe('email_not_verified');

    const verify = await post(t.app, '/api/auth/verify-email', { token: tokenFromMail(t) });
    expect(verify.statusCode).toBe(200);

    const login = await post(t.app, '/api/auth/login', {
      email: 'anna@example.com',
      password: PASSWORD,
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().user).toMatchObject({ email: 'anna@example.com', role: 'user' });

    const me = await get(t.app, '/api/me', sessionCookie(login));
    expect(me.statusCode).toBe(200);
    expect(me.json().user.name).toBe('Anna');
  });

  it('does not allow reusing an invitation', async () => {
    const invite = await createInvite(t);
    const body = {
      acceptPrivacy: true,
      name: 'Anna',
      email: 'anna@example.com',
      password: PASSWORD,
      inviteToken: invite,
    };
    await post(t.app, '/api/auth/register', body);
    const second = await post(t.app, '/api/auth/register', {
      ...body,
      email: 'other@example.com',
    });
    expect(second.statusCode).toBe(400);
    expect(second.json().error.code).toBe('invalid_invite');
  });

  it('enforces the email of an invitation', async () => {
    const invite = await createInvite(t, 'anna@example.com');
    const response = await post(t.app, '/api/auth/register', {
      acceptPrivacy: true,
      name: 'Bob',
      email: 'bob@example.com',
      password: PASSWORD,
      inviteToken: invite,
    });
    expect(response.json().error.code).toBe('invalid_invite');
  });

  it('answers identically for an existing email and mails the owner', async () => {
    await registerAndLogin(t);
    t.mailer.outbox.length = 0;
    const invite = await createInvite(t);
    const response = await post(t.app, '/api/auth/register', {
      acceptPrivacy: true,
      name: 'Mallory',
      email: 'anna@example.com',
      password: PASSWORD,
      inviteToken: invite,
    });
    expect(response.statusCode).toBe(202);
    expect(t.mailer.outbox).toHaveLength(1);
    expect(t.mailer.outbox[0]?.subject).toContain('Konto');
  });

  it('rejects weak passwords', async () => {
    const invite = await createInvite(t);
    const response = await post(t.app, '/api/auth/register', {
      acceptPrivacy: true,
      name: 'Anna',
      email: 'anna@example.com',
      password: 'short',
      inviteToken: invite,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('validation_error');
  });
});

describe('login and sessions', () => {
  it('rejects wrong credentials without revealing which part is wrong', async () => {
    await registerAndLogin(t);
    const wrongPassword = await post(t.app, '/api/auth/login', {
      email: 'anna@example.com',
      password: 'wrong password!',
    });
    const unknownUser = await post(t.app, '/api/auth/login', {
      email: 'nobody@example.com',
      password: 'wrong password!',
    });
    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownUser.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual(unknownUser.json());
  });

  it('rejects disabled accounts and invalidates their sessions', async () => {
    const cookie = await registerAndLogin(t);
    await t.db.update(users).set({ active: false }).where(eq(users.email, 'anna@example.com'));
    expect((await get(t.app, '/api/me', cookie)).statusCode).toBe(401);
    const login = await post(t.app, '/api/auth/login', {
      email: 'anna@example.com',
      password: PASSWORD,
    });
    expect(login.statusCode).toBe(403);
    expect(login.json().error.code).toBe('account_disabled');
  });

  it('logs out', async () => {
    const cookie = await registerAndLogin(t);
    const logout = await post(t.app, '/api/auth/logout', undefined, cookie);
    expect(logout.statusCode).toBe(204);
    expect((await get(t.app, '/api/me', cookie)).statusCode).toBe(401);
  });

  it('requires authentication for /api/me', async () => {
    expect((await get(t.app, '/api/me')).statusCode).toBe(401);
  });

  it('sets a hardened session cookie', async () => {
    await registerAndLogin(t);
    const login = await post(t.app, '/api/auth/login', {
      email: 'anna@example.com',
      password: PASSWORD,
    });
    const cookie = login.cookies.find((c) => c.name === 'foodlog_session');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
  });

  it('rate limits login attempts', async () => {
    const attempts = [];
    for (let i = 0; i < 12; i++) {
      attempts.push(
        await post(t.app, '/api/auth/login', { email: 'a@example.com', password: 'whatever' }),
      );
    }
    expect(attempts.at(-1)?.statusCode).toBe(429);
    expect(attempts.at(-1)?.json().error.code).toBe('rate_limited');
  });
});

describe('login lockout per address', () => {
  const login = (email: string, password: string) =>
    post(t.app, '/api/auth/login', { email, password });
  const failMany = async (email: string) => {
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) await recordLoginFailure(t.db, email);
  };

  it('locks an address after too many failures, even for the right password', async () => {
    await registerAndLogin(t);
    await failMany('anna@example.com');
    const response = await login('anna@example.com', PASSWORD);
    expect(response.statusCode).toBe(429);
    expect(response.json().error.code).toBe('too_many_attempts');
    expect(response.cookies.find((c) => c.name === 'foodlog_session')).toBeUndefined();
  });

  it('treats unknown addresses exactly like known ones', async () => {
    await failMany('nobody@example.com');
    const response = await login('Nobody@Example.com', 'whatever-password');
    expect(response.statusCode).toBe(429);
    expect(response.json().error.code).toBe('too_many_attempts');
  });

  it('does not lock other addresses', async () => {
    await registerAndLogin(t);
    await failMany('someone-else@example.com');
    expect((await login('anna@example.com', PASSWORD)).statusCode).toBe(200);
  });

  it('counts wrong passwords and forgets them after a good login', async () => {
    await registerAndLogin(t);
    for (let i = 0; i < 3; i++) await login('anna@example.com', 'wrong-password');
    const [row] = await t.db.select().from(loginAttempts);
    expect(row?.failures).toBe(3);
    expect((await login('anna@example.com', PASSWORD)).statusCode).toBe(200);
    expect(await t.db.select().from(loginAttempts)).toHaveLength(0);
  });

  it('opens again once the window has passed', async () => {
    await failMany('anna@example.com');
    const later = new Date(Date.now() + LOGIN_WINDOW + 1000);
    expect(await isLoginLocked(t.db, 'anna@example.com')).toBe(true);
    expect(await isLoginLocked(t.db, 'anna@example.com', later)).toBe(false);
    await recordLoginFailure(t.db, 'anna@example.com', later);
    const [row] = await t.db.select().from(loginAttempts);
    expect(row?.failures).toBe(1);
  });

  it('keeps no readable address in the table', async () => {
    await recordLoginFailure(t.db, 'anna@example.com');
    const [row] = await t.db.select().from(loginAttempts);
    expect(JSON.stringify(row)).not.toContain('anna');
  });
});

describe('csrf protection', () => {
  it('rejects state-changing requests from another origin', async () => {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'a@example.com', password: 'x' },
      headers: { origin: 'https://evil.example' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('invalid_origin');
  });

  it('rejects state-changing requests without origin', async () => {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'a@example.com', password: 'x' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('accepts the configured origin', async () => {
    const response = await post(t.app, '/api/auth/login', {
      email: 'a@example.com',
      password: 'x',
    });
    expect(response.statusCode).toBe(401);
    expect(ORIGIN).toBe('http://localhost:5173');
  });
});

describe('password reset', () => {
  it('does not reveal whether an account exists', async () => {
    await registerAndLogin(t);
    t.mailer.outbox.length = 0;
    const known = await post(t.app, '/api/auth/forgot-password', { email: 'anna@example.com' });
    const unknown = await post(t.app, '/api/auth/forgot-password', { email: 'nobody@example.com' });
    expect(known.statusCode).toBe(202);
    expect(unknown.statusCode).toBe(202);
    expect(known.json()).toEqual(unknown.json());
    expect(t.mailer.outbox).toHaveLength(1);
  });

  it('resets the password, invalidates sessions and the token', async () => {
    const cookie = await registerAndLogin(t);
    await post(t.app, '/api/auth/forgot-password', { email: 'anna@example.com' });
    const token = tokenFromMail(t);

    const reset = await post(t.app, '/api/auth/reset-password', {
      token,
      password: 'a brand new password',
    });
    expect(reset.statusCode).toBe(200);
    expect((await get(t.app, '/api/me', cookie)).statusCode).toBe(401);

    const reuse = await post(t.app, '/api/auth/reset-password', {
      token,
      password: 'yet another password',
    });
    expect(reuse.statusCode).toBe(400);

    const login = await post(t.app, '/api/auth/login', {
      email: 'anna@example.com',
      password: 'a brand new password',
    });
    expect(login.statusCode).toBe(200);
  });

  it('rejects unknown tokens', async () => {
    const response = await post(t.app, '/api/auth/reset-password', {
      token: 'x'.repeat(43),
      password: 'a brand new password',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('invalid_token');
  });
});

describe('auth config', () => {
  it('reflects the public registration setting', async () => {
    expect((await get(t.app, '/api/auth/config')).json()).toEqual({
      publicRegistration: false,
      googleLogin: false,
    });
    await setBooleanSetting(t.db, PUBLIC_REGISTRATION, true);
    expect((await get(t.app, '/api/auth/config')).json().publicRegistration).toBe(true);
  });
});
