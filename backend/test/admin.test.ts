import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { AdminUserDetailDto, CreatedInviteDto } from '@foodlog/shared';
import { users } from '../src/db/schema.ts';
import {
  createTestApp,
  get,
  makeAdmin,
  ORIGIN,
  PASSWORD,
  patch,
  post,
  registerAndLogin,
  tokenFromMail,
  type TestApp,
} from './helpers.ts';

let t: TestApp;
let adminCookie: string;
let userCookie: string;
let userId: string;

beforeEach(async () => {
  await t?.close();
  t = await createTestApp();
  adminCookie = await registerAndLogin(t, 'admin@example.com', 'Admin');
  await makeAdmin(t, 'admin@example.com');
  userCookie = await registerAndLogin(t, 'anna@example.com', 'Anna');
  const [user] = await t.db.select().from(users).where(eq(users.email, 'anna@example.com'));
  userId = user!.id;
});

afterAll(async () => {
  await t?.close();
});

function send(method: 'PUT' | 'DELETE', url: string, payload?: unknown, as = adminCookie) {
  return t.app.inject({
    method,
    url,
    payload: payload as object | undefined,
    headers: { origin: ORIGIN, cookie: as },
  });
}

async function detail(id = userId): Promise<AdminUserDetailDto> {
  return (await get(t.app, `/api/admin/users/${id}`, adminCookie)).json();
}

describe('authorization', () => {
  it('rejects guests and regular users on every admin endpoint', async () => {
    const endpoints: [string, string][] = [
      ['GET', '/api/admin/users'],
      ['GET', `/api/admin/users/${userId}`],
      ['PATCH', `/api/admin/users/${userId}`],
      ['POST', `/api/admin/users/${userId}/reset-link`],
      ['PUT', `/api/admin/users/${userId}/features/ai_analysis`],
      ['GET', '/api/admin/invites'],
      ['POST', '/api/admin/invites'],
      ['GET', '/api/admin/settings'],
      ['PATCH', '/api/admin/settings'],
      ['PUT', '/api/admin/features/ai_analysis'],
      ['GET', '/api/admin/audit'],
    ];
    for (const [method, url] of endpoints) {
      const guest = await t.app.inject({
        method: method as 'GET',
        url,
        headers: { origin: ORIGIN },
      });
      expect(guest.statusCode, `${method} ${url} guest`).toBe(401);
      const regular = await t.app.inject({
        method: method as 'GET',
        url,
        payload: method === 'GET' ? undefined : {},
        headers: { origin: ORIGIN, cookie: userCookie },
      });
      expect(regular.statusCode, `${method} ${url} user`).toBe(403);
    }
  });
});

describe('user list and detail', () => {
  it('lists, searches and paginates users', async () => {
    const all = (await get(t.app, '/api/admin/users', adminCookie)).json();
    expect(all.total).toBe(2);
    expect(all.users.map((u: { email: string }) => u.email).sort()).toEqual([
      'admin@example.com',
      'anna@example.com',
    ]);
    expect(all.users.find((u: { email: string }) => u.email === 'anna@example.com')).toMatchObject({
      name: 'Anna',
      role: 'user',
      active: true,
      emailVerified: true,
      hasPassword: true,
      googleLinked: false,
      entryCount: 0,
    });

    const search = (await get(t.app, '/api/admin/users?q=ann', adminCookie)).json();
    expect(search.total).toBe(1);
    expect(search.users[0].email).toBe('anna@example.com');
    expect((await get(t.app, '/api/admin/users?q=%25', adminCookie)).json().total).toBe(0);

    const page = (await get(t.app, '/api/admin/users?pageSize=1&page=2', adminCookie)).json();
    expect(page.users).toHaveLength(1);
    expect(page.total).toBe(2);
  });

  it('counts entries and returns feature details', async () => {
    await post(
      t.app,
      '/api/entries',
      { type: 'stool', occurredAt: '2026-01-10T08:00', bristol: 4 },
      userCookie,
    );
    const body = await detail();
    expect(body.entryCount).toBe(1);
    expect(body.features.find((f) => f.key === 'ai_analysis')).toEqual({
      key: 'ai_analysis',
      globalEnabled: true,
      defaultForUsers: false,
      override: null,
      effective: false,
    });
  });

  it('returns 404 for unknown users and 400 for malformed ids', async () => {
    expect(
      (await get(t.app, '/api/admin/users/00000000-0000-4000-8000-000000000000', adminCookie))
        .statusCode,
    ).toBe(404);
    expect((await get(t.app, '/api/admin/users/nope', adminCookie)).statusCode).toBe(400);
  });
});

describe('editing users', () => {
  it('changes the name', async () => {
    const response = await patch(
      t.app,
      `/api/admin/users/${userId}`,
      { name: 'Anna B' },
      adminCookie,
    );
    expect(response.statusCode).toBe(200);
    expect(response.json().name).toBe('Anna B');
  });

  it('changes the email, requires re-verification, revokes sessions and mails the new address', async () => {
    t.mailer.outbox.length = 0;
    const response = await patch(
      t.app,
      `/api/admin/users/${userId}`,
      { email: 'New@Example.com' },
      adminCookie,
    );
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ email: 'new@example.com', emailVerified: false });
    expect((await get(t.app, '/api/me', userCookie)).statusCode).toBe(401);
    expect(t.mailer.outbox.at(-1)?.to).toBe('new@example.com');
    expect(t.mailer.outbox.at(-1)?.text).toContain('/verify-email?token=');

    const early = await post(t.app, '/api/auth/login', {
      email: 'new@example.com',
      password: PASSWORD,
    });
    expect(early.json().error.code).toBe('email_not_verified');
    await post(t.app, '/api/auth/verify-email', { token: tokenFromMail(t) });
    const login = await post(t.app, '/api/auth/login', {
      email: 'new@example.com',
      password: PASSWORD,
    });
    expect(login.statusCode).toBe(200);
  });

  it('rejects an email that is already taken', async () => {
    const response = await patch(
      t.app,
      `/api/admin/users/${userId}`,
      { email: 'admin@example.com' },
      adminCookie,
    );
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('email_taken');
  });

  it('deactivates and reactivates users and ends their sessions', async () => {
    const off = await patch(t.app, `/api/admin/users/${userId}`, { active: false }, adminCookie);
    expect(off.json().active).toBe(false);
    expect((await get(t.app, '/api/me', userCookie)).statusCode).toBe(401);
    const blocked = await post(t.app, '/api/auth/login', {
      email: 'anna@example.com',
      password: PASSWORD,
    });
    expect(blocked.json().error.code).toBe('account_disabled');

    await patch(t.app, `/api/admin/users/${userId}`, { active: true }, adminCookie);
    const login = await post(t.app, '/api/auth/login', {
      email: 'anna@example.com',
      password: PASSWORD,
    });
    expect(login.statusCode).toBe(200);
  });

  it('promotes and demotes users', async () => {
    await patch(t.app, `/api/admin/users/${userId}`, { role: 'admin' }, adminCookie);
    expect((await get(t.app, '/api/admin/users', userCookie)).statusCode).toBe(200);
    await patch(t.app, `/api/admin/users/${userId}`, { role: 'user' }, adminCookie);
    expect((await get(t.app, '/api/admin/users', userCookie)).statusCode).toBe(403);
  });

  it('protects admins from locking themselves out', async () => {
    const [self] = await t.db.select().from(users).where(eq(users.email, 'admin@example.com'));
    for (const body of [{ active: false }, { role: 'user' }]) {
      const response = await patch(t.app, `/api/admin/users/${self!.id}`, body, adminCookie);
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('cannot_modify_self');
    }
  });

  it('lets an admin demote another admin', async () => {
    await patch(t.app, `/api/admin/users/${userId}`, { role: 'admin' }, adminCookie);
    const demoted = await patch(t.app, `/api/admin/users/${userId}`, { role: 'user' }, adminCookie);
    expect(demoted.statusCode).toBe(200);
    expect((await get(t.app, '/api/admin/users', adminCookie)).statusCode).toBe(200);
  });

  it('validates the update body', async () => {
    for (const body of [
      {},
      { role: 'owner' },
      { email: 'nope' },
      { name: '' },
      { active: 'yes' },
    ]) {
      const response = await patch(t.app, `/api/admin/users/${userId}`, body, adminCookie);
      expect(response.statusCode, JSON.stringify(body)).toBe(400);
    }
  });
});

describe('password reset links', () => {
  it('sends a reset email to the user', async () => {
    t.mailer.outbox.length = 0;
    const response = await post(
      t.app,
      `/api/admin/users/${userId}/reset-link`,
      { delivery: 'email' },
      adminCookie,
    );
    expect(response.json()).toEqual({ delivery: 'email', link: null });
    expect(t.mailer.outbox).toHaveLength(1);
    expect(t.mailer.outbox[0]?.to).toBe('anna@example.com');
  });

  it('returns a usable link without sending mail', async () => {
    t.mailer.outbox.length = 0;
    const response = await post(
      t.app,
      `/api/admin/users/${userId}/reset-link`,
      { delivery: 'link' },
      adminCookie,
    );
    const { link } = response.json();
    expect(link).toContain(`${ORIGIN}/reset-password?token=`);
    expect(t.mailer.outbox).toHaveLength(0);

    const token = new URL(link).searchParams.get('token');
    const reset = await post(t.app, '/api/auth/reset-password', {
      token,
      password: 'set by the user later',
    });
    expect(reset.statusCode).toBe(200);
    expect((await get(t.app, '/api/me', userCookie)).statusCode).toBe(401);
  });

  it('refuses disabled accounts and reports mail failures', async () => {
    await patch(t.app, `/api/admin/users/${userId}`, { active: false }, adminCookie);
    const disabled = await post(
      t.app,
      `/api/admin/users/${userId}/reset-link`,
      { delivery: 'link' },
      adminCookie,
    );
    expect(disabled.statusCode).toBe(409);

    await patch(t.app, `/api/admin/users/${userId}`, { active: true }, adminCookie);
    t.mailer.send = async () => {
      throw new Error('smtp down');
    };
    const failed = await post(
      t.app,
      `/api/admin/users/${userId}/reset-link`,
      { delivery: 'email' },
      adminCookie,
    );
    expect(failed.statusCode).toBe(502);
    expect(failed.json().error.code).toBe('mail_failed');
  });

  it('validates the delivery', async () => {
    const response = await post(
      t.app,
      `/api/admin/users/${userId}/reset-link`,
      { delivery: 'sms' },
      adminCookie,
    );
    expect(response.statusCode).toBe(400);
  });
});

describe('invitations', () => {
  it('creates an invitation whose link can be used to register', async () => {
    const created = await post(t.app, '/api/admin/invites', {}, adminCookie);
    expect(created.statusCode).toBe(201);
    const invite: CreatedInviteDto = created.json();
    expect(invite).toMatchObject({ status: 'open', email: null, emailSent: false });
    expect(invite.link).toContain(`${ORIGIN}/register?invite=`);

    const token = new URL(invite.link).searchParams.get('invite');
    const register = await post(t.app, '/api/auth/register', {
      name: 'Bob',
      email: 'bob@example.com',
      password: PASSWORD,
      inviteToken: token,
    });
    expect(register.statusCode).toBe(202);

    const list = (await get(t.app, '/api/admin/invites', adminCookie)).json();
    const entry = list.find((item: { id: string }) => item.id === invite.id);
    expect(entry).toMatchObject({ status: 'used', usedByEmail: 'bob@example.com' });
    expect(entry.link).toBeUndefined();
  });

  it('can bind an invitation to an email address and send it', async () => {
    t.mailer.outbox.length = 0;
    const created = await post(
      t.app,
      '/api/admin/invites',
      { email: 'Carl@Example.com', sendMail: true, expiresInDays: 3 },
      adminCookie,
    );
    expect(created.json()).toMatchObject({ email: 'carl@example.com', emailSent: true });
    expect(t.mailer.outbox).toHaveLength(1);
    expect(t.mailer.outbox[0]?.to).toBe('carl@example.com');
    expect(t.mailer.outbox[0]?.text).toContain('/register?invite=');

    const days = (Date.parse(created.json().expiresAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(2.9);
    expect(days).toBeLessThan(3.1);
  });

  it('still creates the invitation when the mail cannot be sent', async () => {
    t.mailer.send = async () => {
      throw new Error('smtp down');
    };
    const created = await post(
      t.app,
      '/api/admin/invites',
      { email: 'carl@example.com', sendMail: true },
      adminCookie,
    );
    expect(created.statusCode).toBe(201);
    expect(created.json().emailSent).toBe(false);
    expect(created.json().link).toContain('/register?invite=');
  });

  it('validates the invitation body', async () => {
    for (const body of [
      { sendMail: true },
      { email: 'nope' },
      { expiresInDays: 0 },
      { expiresInDays: 31 },
    ]) {
      const response = await post(t.app, '/api/admin/invites', body, adminCookie);
      expect(response.statusCode, JSON.stringify(body)).toBe(400);
    }
  });

  it('revokes open invitations but not used ones', async () => {
    const open: CreatedInviteDto = (
      await post(t.app, '/api/admin/invites', {}, adminCookie)
    ).json();
    expect((await send('DELETE', `/api/admin/invites/${open.id}`)).statusCode).toBe(204);
    const token = new URL(open.link).searchParams.get('invite');
    const register = await post(t.app, '/api/auth/register', {
      name: 'Bob',
      email: 'bob@example.com',
      password: PASSWORD,
      inviteToken: token,
    });
    expect(register.json().error.code).toBe('invalid_invite');

    const used: CreatedInviteDto = (
      await post(t.app, '/api/admin/invites', {}, adminCookie)
    ).json();
    await post(t.app, '/api/auth/register', {
      name: 'Bob',
      email: 'bob@example.com',
      password: PASSWORD,
      inviteToken: new URL(used.link).searchParams.get('invite'),
    });
    expect((await send('DELETE', `/api/admin/invites/${used.id}`)).statusCode).toBe(409);
    expect(
      (await send('DELETE', '/api/admin/invites/00000000-0000-4000-8000-000000000000')).statusCode,
    ).toBe(404);
  });
});

describe('settings and feature flags', () => {
  it('reads and toggles public registration', async () => {
    const initial = (await get(t.app, '/api/admin/settings', adminCookie)).json();
    expect(initial.publicRegistration).toBe(false);
    expect(initial.features.map((f: { key: string }) => f.key).sort()).toEqual([
      'ai_analysis',
      'data_export',
      'google_login',
    ]);

    const closed = await post(t.app, '/api/auth/register', {
      name: 'Bob',
      email: 'bob@example.com',
      password: PASSWORD,
    });
    expect(closed.statusCode).toBe(403);

    const on = await patch(t.app, '/api/admin/settings', { publicRegistration: true }, adminCookie);
    expect(on.json().publicRegistration).toBe(true);
    expect((await get(t.app, '/api/auth/config')).json().publicRegistration).toBe(true);
    const open = await post(t.app, '/api/auth/register', {
      name: 'Bob',
      email: 'bob@example.com',
      password: PASSWORD,
    });
    expect(open.statusCode).toBe(202);

    await patch(t.app, '/api/admin/settings', { publicRegistration: false }, adminCookie);
    expect((await get(t.app, '/api/auth/config')).json().publicRegistration).toBe(false);
  });

  it('changes global feature flags and applies them to users', async () => {
    const off = await send('PUT', '/api/admin/features/data_export', { enabled: false });
    expect(off.json().features.find((f: { key: string }) => f.key === 'data_export')).toMatchObject(
      {
        enabled: false,
      },
    );
    expect((await get(t.app, '/api/me', userCookie)).json().features.data_export).toBe(false);

    await send('PUT', '/api/admin/features/data_export', { enabled: true });
    expect((await get(t.app, '/api/me', userCookie)).json().features.data_export).toBe(true);

    await send('PUT', '/api/admin/features/ai_analysis', { defaultForUsers: true });
    expect((await get(t.app, '/api/me', userCookie)).json().features.ai_analysis).toBe(true);
    const flags = (await get(t.app, '/api/admin/settings', adminCookie)).json().features;
    expect(flags.find((f: { key: string }) => f.key === 'ai_analysis')).toMatchObject({
      enabled: true,
      defaultForUsers: true,
    });
  });

  it('validates flag updates', async () => {
    expect((await send('PUT', '/api/admin/features/bogus', { enabled: true })).statusCode).toBe(
      400,
    );
    expect((await send('PUT', '/api/admin/features/data_export', {})).statusCode).toBe(400);
    expect(
      (await patch(t.app, '/api/admin/settings', { publicRegistration: 'yes' }, adminCookie))
        .statusCode,
    ).toBe(400);
  });

  it('sets and clears per-user overrides', async () => {
    const on = await send('PUT', `/api/admin/users/${userId}/features/ai_analysis`, {
      enabled: true,
    });
    expect(on.json().features.find((f: { key: string }) => f.key === 'ai_analysis')).toMatchObject({
      override: true,
      effective: true,
    });
    expect((await get(t.app, '/api/me', userCookie)).json().features.ai_analysis).toBe(true);

    const off = await send('PUT', `/api/admin/users/${userId}/features/data_export`, {
      enabled: false,
    });
    expect(
      off.json().features.find((f: { key: string }) => f.key === 'data_export').effective,
    ).toBe(false);
    expect(
      (await get(t.app, '/api/export/entries.csv?from=2026-01-01&to=2026-01-31', userCookie))
        .statusCode,
    ).toBe(403);

    await send('PUT', `/api/admin/users/${userId}/features/ai_analysis`, { enabled: null });
    expect((await get(t.app, '/api/me', userCookie)).json().features.ai_analysis).toBe(false);
  });

  it('keeps the global switch above user overrides', async () => {
    await send('PUT', `/api/admin/users/${userId}/features/ai_analysis`, { enabled: true });
    await send('PUT', '/api/admin/features/ai_analysis', { enabled: false });
    const body = await detail();
    expect(body.features.find((f) => f.key === 'ai_analysis')).toMatchObject({
      override: true,
      globalEnabled: false,
      effective: false,
    });
  });
});

describe('activity log', () => {
  it('records admin actions with stable references, newest first', async () => {
    await patch(t.app, `/api/admin/users/${userId}`, { name: 'Anna B' }, adminCookie);
    await patch(t.app, `/api/admin/users/${userId}`, { active: false }, adminCookie);
    await post(t.app, '/api/admin/invites', { email: 'carl@example.com' }, adminCookie);
    await patch(t.app, '/api/admin/settings', { publicRegistration: true }, adminCookie);
    await send('PUT', '/api/admin/features/data_export', { enabled: false });
    await send('PUT', `/api/admin/users/${userId}/features/ai_analysis`, { enabled: true });

    const log = (await get(t.app, '/api/admin/audit', adminCookie)).json();
    const actions = log.map((entry: { action: string }) => entry.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'user.rename',
        'user.deactivate',
        'invite.create',
        'setting.public_registration',
        'feature.update',
        'user.feature',
      ]),
    );
    const byAction = (action: string) =>
      log.find((entry: { action: string }) => entry.action === action);
    expect(log[0].actor).toMatchObject({ email: 'admin@example.com', name: 'Admin' });
    expect(byAction('user.deactivate').targetUser).toMatchObject({
      id: userId,
      email: 'anna@example.com',
    });
    expect(byAction('user.feature')).toMatchObject({ detail: 'ai_analysis=true' });
    expect(byAction('setting.public_registration').detail).toBe('true');
    expect(byAction('feature.update').detail).toContain('data_export');
    expect(byAction('invite.create').targetUser).toBeNull();
    expect((await get(t.app, '/api/admin/audit?limit=2', adminCookie)).json()).toHaveLength(2);
  });

  it('follows a user across email and name changes', async () => {
    await patch(t.app, `/api/admin/users/${userId}`, { active: false }, adminCookie);
    await patch(t.app, `/api/admin/users/${userId}`, { active: true }, adminCookie);
    await patch(
      t.app,
      `/api/admin/users/${userId}`,
      { email: 'renamed@example.com', name: 'Anna Neu' },
      adminCookie,
    );

    const log = (await get(t.app, '/api/admin/audit', adminCookie)).json();
    const forUser = log.filter(
      (entry: { targetUser: { id: string } | null }) => entry.targetUser?.id === userId,
    );
    expect(forUser.map((entry: { action: string }) => entry.action).sort()).toEqual(
      ['user.activate', 'user.deactivate', 'user.email', 'user.rename'].sort(),
    );
    for (const entry of forUser) {
      expect(entry.targetUser).toEqual({
        id: userId,
        name: 'Anna Neu',
        email: 'renamed@example.com',
      });
    }
  });

  it('shows the changed identity of an admin as actor', async () => {
    const [self] = await t.db.select().from(users).where(eq(users.email, 'admin@example.com'));
    await post(t.app, '/api/admin/invites', {}, adminCookie);
    await t.db.update(users).set({ email: 'admin-new@example.com' }).where(eq(users.id, self!.id));
    const log = (await get(t.app, '/api/admin/audit', adminCookie)).json();
    expect(log[0].actor).toMatchObject({ id: self!.id, email: 'admin-new@example.com' });
  });

  it('drops the personal reference when the user is deleted and stores no email addresses', async () => {
    await patch(t.app, `/api/admin/users/${userId}`, { email: 'moved@example.com' }, adminCookie);
    await post(t.app, `/api/admin/users/${userId}/reset-link`, { delivery: 'link' }, adminCookie);
    await post(t.app, '/api/admin/invites', { email: 'carl@example.com' }, adminCookie);

    const [raw] = await t.pool.query('SELECT * FROM admin_audit');
    const text = JSON.stringify(raw);
    for (const address of ['anna@example.com', 'moved@example.com', 'carl@example.com']) {
      expect(text).not.toContain(address);
    }

    await t.db.delete(users).where(eq(users.id, userId));
    const log = (await get(t.app, '/api/admin/audit', adminCookie)).json();
    const reset = log.find((entry: { action: string }) => entry.action === 'user.reset_link.link');
    expect(reset).toBeDefined();
    expect(reset.targetUser).toBeNull();
    expect(
      log.some((entry: { targetUser: { id: string } | null }) => entry.targetUser?.id === userId),
    ).toBe(false);
  });
});
