import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { users } from '../src/db/schema.ts';
import {
  get,
  ORIGIN,
  sessionCookie,
  PASSWORD,
  patch,
  post,
  registerAndLogin,
  tokenFromMail,
  createTestApp,
  type TestApp,
} from './helpers.ts';

let t: TestApp;
let cookie: string;

beforeEach(async () => {
  await t?.close();
  t = await createTestApp();
  cookie = await registerAndLogin(t);
});

afterAll(async () => {
  await t?.close();
});

function multipartFile(name: string, type: string, content: Buffer) {
  const boundary = '----foodlogtest';
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${type}\r\n\r\n`;
  const tail = `\r\n--${boundary}--\r\n`;
  return {
    payload: Buffer.concat([Buffer.from(head), content, Buffer.from(tail)]),
    headers: {
      origin: ORIGIN,
      cookie,
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
  };
}

describe('profile', () => {
  it('returns the user and resolved feature flags', async () => {
    const response = await get(t.app, '/api/me', cookie);
    expect(response.json()).toMatchObject({
      user: { email: 'anna@example.com', hasPassword: true, googleLinked: false },
      features: { ai_analysis: false, google_login: true, data_export: true },
    });
  });

  it('updates profile fields', async () => {
    const response = await patch(
      t.app,
      '/api/me',
      { name: 'Anna B', locale: 'en', timezone: 'America/New_York', avatar: 'preset:5' },
      cookie,
    );
    expect(response.statusCode).toBe(200);
    expect(response.json().user).toMatchObject({
      name: 'Anna B',
      locale: 'en',
      timezone: 'America/New_York',
      avatar: 'preset:5',
    });
  });

  it('rejects invalid profile values', async () => {
    for (const body of [
      { timezone: 'Mars/Base' },
      { avatar: 'preset:13' },
      { locale: 'fr' },
      { name: '' },
    ]) {
      expect((await patch(t.app, '/api/me', body, cookie)).statusCode).toBe(400);
    }
  });

  it('does not allow changing role or email through the profile', async () => {
    await patch(t.app, '/api/me', { role: 'admin', email: 'x@example.com' }, cookie);
    const me = (await get(t.app, '/api/me', cookie)).json();
    expect(me.user.role).toBe('user');
    expect(me.user.email).toBe('anna@example.com');
  });
});

describe('avatar upload', () => {
  it('re-encodes an uploaded image to 256x256 webp', async () => {
    const png = await sharp({
      create: { width: 600, height: 300, channels: 3, background: '#1F6F54' },
    })
      .png()
      .toBuffer();
    const upload = await t.app.inject({
      method: 'POST',
      url: '/api/me/avatar',
      ...multipartFile('a.png', 'image/png', png),
    });
    expect(upload.statusCode).toBe(200);
    expect(upload.json().user.avatar).toBe('upload');

    const image = await get(t.app, '/api/me/avatar', cookie);
    expect(image.headers['content-type']).toBe('image/webp');
    const metadata = await sharp(image.rawPayload).metadata();
    expect(metadata).toMatchObject({ format: 'webp', width: 256, height: 256 });
  });

  it('rejects files that are not images', async () => {
    const upload = await t.app.inject({
      method: 'POST',
      url: '/api/me/avatar',
      ...multipartFile('a.png', 'image/png', Buffer.from('<svg onload=alert(1)>')),
    });
    expect(upload.statusCode).toBe(400);
    expect(upload.json().error.code).toBe('invalid_image');
  });

  it('switching back to a preset removes the upload', async () => {
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } })
      .png()
      .toBuffer();
    await t.app.inject({
      method: 'POST',
      url: '/api/me/avatar',
      ...multipartFile('a.png', 'image/png', png),
    });
    await patch(t.app, '/api/me', { avatar: 'preset:2' }, cookie);
    expect((await get(t.app, '/api/me/avatar', cookie)).statusCode).toBe(404);
  });
});

describe('email change', () => {
  it('requires the current password', async () => {
    const response = await post(t.app, '/api/me/email', { newEmail: 'new@example.com' }, cookie);
    expect(response.statusCode).toBe(403);
    expect(t.mailer.outbox).toHaveLength(1);
  });

  it('changes the email after confirmation via the new address', async () => {
    const request = await post(
      t.app,
      '/api/me/email',
      { newEmail: 'New@Example.com', password: PASSWORD },
      cookie,
    );
    expect(request.statusCode).toBe(202);
    expect(t.mailer.outbox.at(-1)?.to).toBe('new@example.com');

    const me = (await get(t.app, '/api/me', cookie)).json();
    expect(me.user.email).toBe('anna@example.com');

    const confirm = await post(t.app, '/api/me/email/confirm', { token: tokenFromMail(t) }, cookie);
    expect(confirm.statusCode).toBe(200);
    expect((await get(t.app, '/api/me', cookie)).json().user.email).toBe('new@example.com');
  });

  it('answers the same for a taken address and only warns its owner', async () => {
    await registerAndLogin(t, 'bob@example.com', 'Bob');
    t.mailer.outbox.length = 0;
    const taken = await post(
      t.app,
      '/api/me/email',
      { newEmail: 'bob@example.com', password: PASSWORD },
      cookie,
    );
    const free = await post(
      t.app,
      '/api/me/email',
      { newEmail: 'free@example.com', password: PASSWORD },
      cookie,
    );
    expect(taken.statusCode).toBe(202);
    expect(taken.json()).toEqual(free.json());
    expect(t.mailer.outbox.map((mail) => mail.to)).toEqual(['bob@example.com', 'free@example.com']);
    expect(t.mailer.outbox[0]?.text).not.toContain('/confirm-email?token=');
    expect(t.mailer.outbox[1]?.text).toContain('/confirm-email?token=');
  });
});

describe('email change and sessions', () => {
  const login = async () =>
    sessionCookie(
      await post(t.app, '/api/auth/login', { email: 'anna@example.com', password: PASSWORD }),
    );
  const request = (newEmail: string, as: string) =>
    post(t.app, '/api/me/email', { newEmail, password: PASSWORD }, as);

  it('ends the other sessions but keeps the one that confirms', async () => {
    const other = await login();
    await request('new@example.com', cookie);
    const confirm = await post(t.app, '/api/me/email/confirm', { token: tokenFromMail(t) }, cookie);
    expect(confirm.statusCode).toBe(200);
    expect((await get(t.app, '/api/me', cookie)).statusCode).toBe(200);
    expect((await get(t.app, '/api/me', other)).statusCode).toBe(401);
  });

  it('ends every session when the link is opened without being signed in', async () => {
    await request('new@example.com', cookie);
    await post(t.app, '/api/me/email/confirm', { token: tokenFromMail(t) });
    expect((await get(t.app, '/api/me', cookie)).statusCode).toBe(401);
  });

  describe('for an account without a password', () => {
    beforeEach(async () => {
      await t.db
        .update(users)
        .set({ passwordHash: null })
        .where(eq(users.email, 'anna@example.com'));
      t.mailer.outbox.length = 0;
    });

    it('asks the current address for approval instead of the new one', async () => {
      const response = await post(t.app, '/api/me/email', { newEmail: 'new@example.com' }, cookie);
      expect(response.statusCode).toBe(202);
      expect(t.mailer.outbox).toHaveLength(1);
      expect(t.mailer.outbox[0]?.to).toBe('anna@example.com');
      expect(t.mailer.outbox[0]?.text).toContain('new@example.com');
    });

    it('changes the address only after approval and then verifies the new one', async () => {
      await post(t.app, '/api/me/email', { newEmail: 'new@example.com' }, cookie);
      const approve = await post(
        t.app,
        '/api/me/email/confirm',
        { token: tokenFromMail(t) },
        cookie,
      );
      expect(approve.json().status).toBe('verification_sent');
      const [row] = await t.db.select().from(users).where(eq(users.email, 'new@example.com'));
      expect(row?.emailVerifiedAt).toBeNull();
      const mail = t.mailer.outbox.at(-1);
      expect(mail?.to).toBe('new@example.com');
      expect(mail?.text).toContain('/verify-email?token=');

      await post(t.app, '/api/auth/verify-email', { token: tokenFromMail(t) });
      const [verified] = await t.db.select().from(users).where(eq(users.email, 'new@example.com'));
      expect(verified?.emailVerifiedAt).not.toBeNull();
    });

    it('does not reveal a taken address and sends no approval for it', async () => {
      await registerAndLogin(t, 'bob@example.com', 'Bob');
      t.mailer.outbox.length = 0;
      const response = await post(t.app, '/api/me/email', { newEmail: 'bob@example.com' }, cookie);
      expect(response.statusCode).toBe(202);
      expect(t.mailer.outbox.map((mail) => mail.to)).toEqual(['bob@example.com']);
      expect(t.mailer.outbox[0]?.text).not.toContain('/confirm-email');
    });
  });
});

describe('password change via reset link', () => {
  it('sends a reset link to the own address', async () => {
    t.mailer.outbox.length = 0;
    const response = await post(t.app, '/api/me/password-reset', undefined, cookie);
    expect(response.statusCode).toBe(202);
    expect(t.mailer.outbox).toHaveLength(1);
    expect(t.mailer.outbox[0]?.to).toBe('anna@example.com');
    expect(t.mailer.outbox[0]?.text).toContain('/reset-password?token=');
  });
});
