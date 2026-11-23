import { eq, sql } from 'drizzle-orm';
import { buildApp, type AppDeps } from '../src/app.ts';
import { encryptionKeys, loadConfig, type Config } from '../src/config.ts';
import { createDb } from '../src/db/client.ts';
import { invites, mfaTotp, users } from '../src/db/schema.ts';
import { hashToken, newId, newToken } from '../src/lib/crypto.ts';
import { createSecretBox } from '../src/lib/secret-box.ts';
import { DAY, inFuture } from '../src/lib/time.ts';
import { createMemoryMailer } from '../src/services/mail.ts';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'mysql://foodlog:foodlog@127.0.0.1:3306/foodlog_test';

export const ORIGIN = 'http://localhost:5173';
export const PASSWORD = 'correct horse battery';

const TABLES = [
  'webauthn_challenges',
  'login_challenges',
  'mfa_recovery_codes',
  'passkeys',
  'mfa_totp',
  'ai_keys',
  'ai_settings',
  'admin_audit',
  'template_ingredients',
  'templates',
  'entry_ingredients',
  'entries',
  'user_feature_overrides',
  'feature_flags',
  'settings',
  'oauth_accounts',
  'invites',
  'login_attempts',
  'auth_tokens',
  'sessions',
  'user_avatars',
  'users',
];

export async function createTestApp(
  overrides: Partial<Record<keyof Config, string>> = {},
  fetchStub?: typeof fetch,
  extra: Partial<Pick<AppDeps, 'aiProviders'>> = {},
) {
  const config = loadConfig({
    NODE_ENV: 'test',
    APP_URL: ORIGIN,
    DATABASE_URL: TEST_DATABASE_URL,
    API_KEY_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: '1025',
    SMTP_FROM: 'Foodlog <foodlog@example.com>',
    ...overrides,
  });
  const { db, pool } = createDb(config.DATABASE_URL);
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
  for (const table of TABLES) await db.execute(sql.raw(`TRUNCATE TABLE ${table}`));
  await db.execute(sql`DELETE FROM ingredients WHERE user_id IS NOT NULL`);
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
  const mailer = createMemoryMailer();
  const app = await buildApp({ config, db, mailer, fetch: fetchStub, ...extra });
  return {
    app,
    db,
    pool,
    mailer,
    config,
    async close() {
      await app.close();
      await pool.end();
    },
  };
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;

export function post(app: TestApp['app'], url: string, payload?: unknown, cookie?: string) {
  return app.inject({
    method: 'POST',
    url,
    payload: payload as object | undefined,
    headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) },
  });
}

export function get(app: TestApp['app'], url: string, cookie?: string) {
  return app.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} });
}

export function patch(app: TestApp['app'], url: string, payload: unknown, cookie: string) {
  return app.inject({
    method: 'PATCH',
    url,
    payload: payload as object,
    headers: { origin: ORIGIN, cookie },
  });
}

export async function createInvite(t: TestApp, email?: string): Promise<string> {
  const token = newToken();
  await t.db.insert(invites).values({
    id: newId(),
    tokenHash: hashToken(token),
    email: email ?? null,
    expiresAt: inFuture(DAY),
  });
  return token;
}

export function tokenFromMail(t: TestApp, index = -1): string {
  const mail = t.mailer.outbox.at(index);
  const match = mail?.text.match(/token=([\w-]+)/);
  if (!match?.[1]) throw new Error('no token in mail');
  return match[1];
}

export function sessionCookie(response: { cookies: { name: string; value: string }[] }): string {
  const cookie = response.cookies.find((c) => c.name === 'foodlog_session');
  if (!cookie) throw new Error('no session cookie');
  return `foodlog_session=${cookie.value}`;
}

export async function registerAndLogin(t: TestApp, email = 'anna@example.com', name = 'Anna') {
  const invite = await createInvite(t);
  await post(t.app, '/api/auth/register', {
    acceptPrivacy: true,
    name,
    email,
    password: PASSWORD,
    inviteToken: invite,
  });
  await post(t.app, '/api/auth/verify-email', { token: tokenFromMail(t) });
  const login = await post(t.app, '/api/auth/login', { email, password: PASSWORD });
  return sessionCookie(login);
}

export const TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

export async function enrollTotp(t: TestApp, email: string, secret = TOTP_SECRET) {
  const [user] = await t.db.select().from(users).where(eq(users.email, email));
  const box = createSecretBox(encryptionKeys(t.config));
  await t.db
    .insert(mfaTotp)
    .values({
      userId: user!.id,
      secret: box.encrypt(secret, `${user!.id}:totp`),
      confirmedAt: new Date(),
    })
    .onDuplicateKeyUpdate({ set: { confirmedAt: new Date() } });
}

// Administrators need a second factor to reach the admin API.
export async function makeAdmin(t: TestApp, email: string) {
  await t.db.update(users).set({ role: 'admin' }).where(eq(users.email, email));
  await enrollTotp(t, email);
}
