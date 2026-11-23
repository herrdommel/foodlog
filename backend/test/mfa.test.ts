import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { generateSync } from 'otplib';
import { mfaRecoveryCodes, mfaTotp, passkeys, sessions, users } from '../src/db/schema.ts';
import {
  createTestApp,
  enrollTotp,
  get,
  makeAdmin,
  ORIGIN,
  PASSWORD,
  post,
  registerAndLogin,
  TOTP_SECRET,
  type TestApp,
} from './helpers.ts';
import { createSoftwareAuthenticator } from './software-authenticator.ts';

let t: TestApp;
let cookie: string;

const code = (secret: string, offsetSeconds = 0) =>
  generateSync({ secret, epoch: Math.floor(Date.now() / 1000) + offsetSeconds });

beforeEach(async () => {
  await t?.close();
  t = await createTestApp();
  cookie = await registerAndLogin(t);
});

afterAll(async () => {
  await t?.close();
});

const login = () =>
  post(t.app, '/api/auth/login', { email: 'anna@example.com', password: PASSWORD });

function cookieHeader(response: { cookies: { name: string; value: string }[] }, name: string) {
  const found = response.cookies.find((item) => item.name === name);
  return found ? `${name}=${found.value}` : '';
}

async function setupTotp(as = cookie) {
  const setup = (await post(t.app, '/api/me/mfa/totp/setup', undefined, as)).json();
  const confirm = await post(
    t.app,
    '/api/me/mfa/totp/confirm',
    { code: code(setup.secret), password: PASSWORD },
    as,
  );
  return { secret: setup.secret as string, confirm };
}

describe('authenticator app', () => {
  it('sets up with a valid code and returns recovery codes once', async () => {
    const setup = (await post(t.app, '/api/me/mfa/totp/setup', undefined, cookie)).json();
    expect(setup.otpauthUrl).toMatch(/^otpauth:\/\/totp\/.+secret=/);

    const wrong = await post(
      t.app,
      '/api/me/mfa/totp/confirm',
      { code: '000000', password: PASSWORD },
      cookie,
    );
    expect(wrong.json().error.code).toBe('invalid_code');

    const noPassword = await post(t.app, '/api/me/mfa/totp/confirm', { code: '123456' }, cookie);
    expect(noPassword.json().error.code).toBe('invalid_password');

    const { confirm } = await setupTotp();
    expect(confirm.statusCode).toBe(200);
    expect(confirm.json().recoveryCodes).toHaveLength(10);
    const me = (await get(t.app, '/api/me', cookie)).json();
    expect(me.mfa).toMatchObject({ enabled: true, totp: true, recoveryCodesLeft: 10 });
  });

  it('stores the secret encrypted', async () => {
    const { secret } = await setupTotp();
    const [row] = await t.db.select().from(mfaTotp);
    expect(row!.secret).not.toContain(secret);
    expect(row!.secret.startsWith('v1.')).toBe(true);
  });

  it('ends the other sessions when a factor is added', async () => {
    const other = await login();
    expect(other.statusCode).toBe(200);
    await setupTotp();
    expect(await t.db.select().from(sessions)).toHaveLength(1);
  });

  it('asks for the second step instead of opening a session', async () => {
    const { secret } = await setupTotp();
    const first = await login();
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ mfaRequired: true, methods: ['totp', 'recovery'] });
    expect(first.cookies.some((item) => item.name === 'foodlog_session')).toBe(false);

    const pending = cookieHeader(first, 'foodlog_mfa');
    const wrong = await post(t.app, '/api/auth/mfa/totp', { code: '111111' }, pending);
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json().error.code).toBe('invalid_code');

    const ok = await post(t.app, '/api/auth/mfa/totp', { code: code(secret, 30) }, pending);
    expect(ok.statusCode).toBe(200);
    expect(ok.json().user.email).toBe('anna@example.com');
    const session = cookieHeader(ok, 'foodlog_session');
    expect((await get(t.app, '/api/me', session)).statusCode).toBe(200);

    const reused = await post(t.app, '/api/auth/mfa/totp', { code: code(secret, 30) }, pending);
    expect(reused.json().error.code).toBe('mfa_expired');
  });

  it('does not accept the same code twice', async () => {
    const { secret } = await setupTotp();
    const used = code(secret, 30);
    const first = cookieHeader(await login(), 'foodlog_mfa');
    expect((await post(t.app, '/api/auth/mfa/totp', { code: used }, first)).statusCode).toBe(200);
    const second = cookieHeader(await login(), 'foodlog_mfa');
    const replay = await post(t.app, '/api/auth/mfa/totp', { code: used }, second);
    expect(replay.json().error.code).toBe('invalid_code');
  });

  it('drops the pending sign-in after five wrong codes', async () => {
    const { secret } = await setupTotp();
    const pending = cookieHeader(await login(), 'foodlog_mfa');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await post(t.app, '/api/auth/mfa/totp', { code: '222222' }, pending);
    }
    const late = await post(t.app, '/api/auth/mfa/totp', { code: code(secret) }, pending);
    expect(late.json().error.code).toBe('mfa_expired');
  });

  it('counts wrong codes against the sign-in lock across new attempts', async () => {
    await setupTotp();
    let pending = cookieHeader(await login(), 'foodlog_mfa');
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (attempt % 3 === 0) pending = cookieHeader(await login(), 'foodlog_mfa');
      await post(t.app, '/api/auth/mfa/totp', { code: '333333' }, pending);
    }
    const locked = await login();
    expect(locked.statusCode).toBe(429);
    expect(locked.json().error.code).toBe('too_many_attempts');
  });

  it('accepts a recovery code once', async () => {
    const { confirm } = await setupTotp();
    const [recovery] = confirm.json().recoveryCodes as string[];
    const pending = cookieHeader(await login(), 'foodlog_mfa');
    const ok = await post(
      t.app,
      '/api/auth/mfa/recovery',
      { code: recovery!.toUpperCase() },
      pending,
    );
    expect(ok.statusCode).toBe(200);
    const again = cookieHeader(await login(), 'foodlog_mfa');
    const reused = await post(t.app, '/api/auth/mfa/recovery', { code: recovery }, again);
    expect(reused.json().error.code).toBe('invalid_code');
  });

  it('regenerates recovery codes and invalidates the old ones', async () => {
    const { confirm } = await setupTotp();
    const [old] = confirm.json().recoveryCodes as string[];
    const fresh = await post(t.app, '/api/me/mfa/recovery-codes', { password: PASSWORD }, cookie);
    expect(fresh.json().recoveryCodes).toHaveLength(10);
    expect(await t.db.select().from(mfaRecoveryCodes)).toHaveLength(10);
    const pending = cookieHeader(await login(), 'foodlog_mfa');
    const response = await post(t.app, '/api/auth/mfa/recovery', { code: old }, pending);
    expect(response.statusCode).toBe(401);
  });

  it('disables only with the password and clears the recovery codes', async () => {
    await setupTotp();
    const denied = await post(
      t.app,
      '/api/me/mfa/totp/disable',
      { password: 'nope nope nope' },
      cookie,
    );
    expect(denied.statusCode).toBe(403);
    const ok = await post(t.app, '/api/me/mfa/totp/disable', { password: PASSWORD }, cookie);
    expect(ok.statusCode).toBe(204);
    expect(await t.db.select().from(mfaRecoveryCodes)).toHaveLength(0);
    expect((await login()).json().user).toBeDefined();
  });

  it('asks for a recent sign-in when the account has no password', async () => {
    await t.db.update(users).set({ passwordHash: null }).where(eq(users.email, 'anna@example.com'));
    const setup = (await post(t.app, '/api/me/mfa/totp/setup', undefined, cookie)).json();
    const fresh = await post(
      t.app,
      '/api/me/mfa/totp/confirm',
      { code: code(setup.secret) },
      cookie,
    );
    expect(fresh.statusCode).toBe(200);

    await t.db.update(sessions).set({ createdAt: new Date(Date.now() - 3_600_000) });
    const stale = await post(t.app, '/api/me/mfa/recovery-codes', {}, cookie);
    expect(stale.json().error.code).toBe('reauth_required');
  });

  it('keeps a disabled or unverified account out after the password step', async () => {
    await setupTotp();
    const pending = cookieHeader(await login(), 'foodlog_mfa');
    await t.db.update(users).set({ active: false }).where(eq(users.email, 'anna@example.com'));
    const response = await post(t.app, '/api/auth/mfa/totp', { code: '123456' }, pending);
    expect(response.json().error.code).toBe('account_disabled');
  });
});

describe('data export', () => {
  it('lists the factors without any secret material', async () => {
    const { secret } = await setupTotp();
    const data = (await get(t.app, '/api/me/export', cookie)).json();
    expect(data.twoFactor).toEqual({
      authenticatorApp: true,
      passkeys: [],
      unusedRecoveryCodes: 10,
    });
    expect(JSON.stringify(data)).not.toContain(secret);
  });
});

describe('passkeys', () => {
  const rpId = new URL(ORIGIN).hostname;

  async function addPasskey(as = cookie, name = 'Laptop') {
    const device = createSoftwareAuthenticator(rpId, ORIGIN);
    const optionsResponse = await post(
      t.app,
      '/api/me/mfa/passkeys/options',
      { password: PASSWORD },
      as,
    );
    const { options } = optionsResponse.json();
    const challengeCookie = cookieHeader(optionsResponse, 'foodlog_webauthn');
    const response = await post(
      t.app,
      '/api/me/mfa/passkeys',
      { name, response: device.register(options.challenge) },
      `${as}; ${challengeCookie}`,
    );
    return { device, response };
  }

  it('registers a passkey and issues recovery codes for the first factor', async () => {
    const { response } = await addPasskey();
    expect(response.statusCode).toBe(200);
    expect(response.json().passkey.name).toBe('Laptop');
    expect(response.json().recoveryCodes).toHaveLength(10);
    const me = (await get(t.app, '/api/me', cookie)).json();
    expect(me.mfa.passkeys).toHaveLength(1);
    expect(me.mfa.enabled).toBe(true);
  });

  it('needs the password before it hands out registration options', async () => {
    const response = await post(t.app, '/api/me/mfa/passkeys/options', {}, cookie);
    expect(response.json().error.code).toBe('invalid_password');
  });

  it('uses a challenge only once', async () => {
    const device = createSoftwareAuthenticator(rpId, ORIGIN);
    const optionsResponse = await post(
      t.app,
      '/api/me/mfa/passkeys/options',
      { password: PASSWORD },
      cookie,
    );
    const challengeCookie = cookieHeader(optionsResponse, 'foodlog_webauthn');
    const body = {
      name: 'Phone',
      response: device.register(optionsResponse.json().options.challenge),
    };
    const first = await post(t.app, '/api/me/mfa/passkeys', body, `${cookie}; ${challengeCookie}`);
    expect(first.statusCode).toBe(200);
    const second = await post(t.app, '/api/me/mfa/passkeys', body, `${cookie}; ${challengeCookie}`);
    expect(second.json().error.code).toBe('invalid_challenge');
  });

  it('rejects a registration signed for another origin', async () => {
    const device = createSoftwareAuthenticator(rpId, 'https://evil.example');
    const optionsResponse = await post(
      t.app,
      '/api/me/mfa/passkeys/options',
      { password: PASSWORD },
      cookie,
    );
    const response = await post(
      t.app,
      '/api/me/mfa/passkeys',
      { name: 'Evil', response: device.register(optionsResponse.json().options.challenge) },
      `${cookie}; ${cookieHeader(optionsResponse, 'foodlog_webauthn')}`,
    );
    expect(response.json().error.code).toBe('passkey_rejected');
    expect(await t.db.select().from(passkeys)).toHaveLength(0);
  });

  it('works as the second step after the password', async () => {
    const { device } = await addPasskey();
    const first = await login();
    expect(first.json().methods).toEqual(['passkey', 'recovery']);
    const pending = cookieHeader(first, 'foodlog_mfa');

    const optionsResponse = await post(t.app, '/api/auth/mfa/passkey/options', undefined, pending);
    const { options } = optionsResponse.json();
    expect(options.userVerification).toBe('required');
    expect(options.allowCredentials).toHaveLength(1);
    const ok = await post(
      t.app,
      '/api/auth/mfa/passkey/verify',
      { response: device.assert(options.challenge) },
      `${pending}; ${cookieHeader(optionsResponse, 'foodlog_webauthn')}`,
    );
    expect(ok.statusCode).toBe(200);
    expect(ok.json().user.email).toBe('anna@example.com');
  });

  it('rejects a passkey of another account as second step', async () => {
    const { device } = await addPasskey();
    await registerAndLogin(t, 'bob@example.com', 'Bob');
    await enrollTotp(t, 'bob@example.com');
    const bob = await post(t.app, '/api/auth/login', {
      email: 'bob@example.com',
      password: PASSWORD,
    });
    const pending = cookieHeader(bob, 'foodlog_mfa');
    const optionsResponse = await post(t.app, '/api/auth/mfa/passkey/options', undefined, pending);
    const response = await post(
      t.app,
      '/api/auth/mfa/passkey/verify',
      { response: device.assert(optionsResponse.json().options.challenge) },
      `${pending}; ${cookieHeader(optionsResponse, 'foodlog_webauthn')}`,
    );
    expect(response.statusCode).toBe(401);
  });

  it('signs in without a password and without a second step', async () => {
    const { device } = await addPasskey();
    const optionsResponse = await post(t.app, '/api/auth/passkey/options');
    const { options } = optionsResponse.json();
    expect(options.allowCredentials ?? []).toHaveLength(0);
    const ok = await post(
      t.app,
      '/api/auth/passkey/verify',
      { response: device.assert(options.challenge) },
      cookieHeader(optionsResponse, 'foodlog_webauthn'),
    );
    expect(ok.statusCode).toBe(200);
    expect(ok.json().user.email).toBe('anna@example.com');
    const session = cookieHeader(ok, 'foodlog_session');
    expect((await get(t.app, '/api/me', session)).statusCode).toBe(200);
  });

  it('does not let a deactivated account in with a passkey', async () => {
    const { device } = await addPasskey();
    await t.db.update(users).set({ active: false }).where(eq(users.email, 'anna@example.com'));
    const optionsResponse = await post(t.app, '/api/auth/passkey/options');
    const response = await post(
      t.app,
      '/api/auth/passkey/verify',
      { response: device.assert(optionsResponse.json().options.challenge) },
      cookieHeader(optionsResponse, 'foodlog_webauthn'),
    );
    expect(response.statusCode).toBe(403);
  });

  it('does not accept an unknown passkey or a stale challenge', async () => {
    const stranger = createSoftwareAuthenticator(rpId, ORIGIN);
    const optionsResponse = await post(t.app, '/api/auth/passkey/options');
    const { options } = optionsResponse.json();
    const unknown = await post(
      t.app,
      '/api/auth/passkey/verify',
      { response: stranger.assert(options.challenge) },
      cookieHeader(optionsResponse, 'foodlog_webauthn'),
    );
    expect(unknown.statusCode).toBe(401);
    const stale = await post(
      t.app,
      '/api/auth/passkey/verify',
      { response: stranger.assert(options.challenge) },
      cookieHeader(optionsResponse, 'foodlog_webauthn'),
    );
    expect(stale.json().error.code).toBe('invalid_challenge');
  });

  it('renames and removes a passkey', async () => {
    const { response } = await addPasskey();
    const id = response.json().passkey.id;
    const rename = await t.app.inject({
      method: 'PATCH',
      url: `/api/me/mfa/passkeys/${id}`,
      payload: { name: 'Work laptop' },
      headers: { origin: ORIGIN, cookie },
    });
    expect(rename.statusCode).toBe(204);
    const removed = await post(
      t.app,
      `/api/me/mfa/passkeys/${id}/delete`,
      { password: PASSWORD },
      cookie,
    );
    expect(removed.statusCode).toBe(204);
    expect((await get(t.app, '/api/me', cookie)).json().mfa.enabled).toBe(false);
    expect(await t.db.select().from(mfaRecoveryCodes)).toHaveLength(0);
  });
});

describe('administrators', () => {
  it('cannot use the admin API without a second factor, but can set one up', async () => {
    await t.db.update(users).set({ role: 'admin' }).where(eq(users.email, 'anna@example.com'));
    const denied = await get(t.app, '/api/admin/users', cookie);
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe('mfa_required');
    expect((await get(t.app, '/api/me', cookie)).json().mfa).toMatchObject({
      required: true,
      enabled: false,
    });
    await setupTotp();
    expect((await get(t.app, '/api/admin/users', cookie)).statusCode).toBe(200);
  });

  it('cannot remove the last factor', async () => {
    await makeAdmin(t, 'anna@example.com');
    const response = await post(t.app, '/api/me/mfa/totp/disable', { password: PASSWORD }, cookie);
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('mfa_required');
  });

  it('resets the factors of another account, ends its sessions and logs it', async () => {
    const anna = await registerAndLogin(t, 'bob@example.com', 'Bob');
    await enrollTotp(t, 'bob@example.com');
    await makeAdmin(t, 'anna@example.com');
    const [bob] = await t.db.select().from(users).where(eq(users.email, 'bob@example.com'));

    const response = await post(t.app, `/api/admin/users/${bob!.id}/mfa-reset`, undefined, cookie);
    expect(response.statusCode).toBe(204);
    expect((await get(t.app, '/api/me', anna)).statusCode).toBe(401);
    expect(await t.db.select().from(mfaTotp).where(eq(mfaTotp.userId, bob!.id))).toHaveLength(0);
    const log = (await get(t.app, '/api/admin/audit', cookie)).json();
    expect(log[0]).toMatchObject({ action: 'user.mfa_reset' });
    expect(JSON.stringify(log)).not.toContain(TOTP_SECRET);
  });

  it('does not reset its own factors through the admin API', async () => {
    await makeAdmin(t, 'anna@example.com');
    const [self] = await t.db.select().from(users).where(eq(users.email, 'anna@example.com'));
    const response = await post(t.app, `/api/admin/users/${self!.id}/mfa-reset`, undefined, cookie);
    expect(response.statusCode).toBe(409);
  });

  it('lists whether an account has a second factor', async () => {
    await makeAdmin(t, 'anna@example.com');
    const [self] = await t.db.select().from(users).where(eq(users.email, 'anna@example.com'));
    const detail = (await get(t.app, `/api/admin/users/${self!.id}`, cookie)).json();
    expect(detail.mfaEnabled).toBe(true);
  });
});
