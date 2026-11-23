import { eq, ne, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { syncCatalog } from '../src/catalog/sync.ts';
import { buildApp } from '../src/app.ts';
import { encryptionKeys, loadConfig } from '../src/config.ts';
import { generateSync } from 'otplib';
import { createDb } from '../src/db/client.ts';
import { insertDemoEntries } from '../src/db/demo-data.ts';
import { invites, mfaTotp, userFeatureOverrides, users } from '../src/db/schema.ts';
import { hashToken, newId, newToken } from '../src/lib/crypto.ts';
import { createSecretBox } from '../src/lib/secret-box.ts';
import { DAY, inFuture } from '../src/lib/time.ts';
import { createMemoryMailer } from '../src/services/mail.ts';

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);

await migrate(db, { migrationsFolder: new URL('../drizzle', import.meta.url).pathname });

await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
const [tables] = await pool.query<{ TABLE_NAME: string }[] & never>(
  `SELECT TABLE_NAME FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME <> '__drizzle_migrations'`,
);
for (const { TABLE_NAME } of tables as unknown as { TABLE_NAME: string }[]) {
  await pool.query(`TRUNCATE TABLE \`${TABLE_NAME}\``);
}
await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
await syncCatalog(db);

const mailer = createMemoryMailer();
const app = await buildApp({ config, db, mailer, disableRateLimit: true });

const OFF_FIXTURES: Record<string, unknown> = {
  '2999999999779': {
    status: 1,
    product: {
      product_name: 'Hazel spread',
      brands: 'Acme',
      ingredients: [
        { id: 'en:sugar', text: 'sugar' },
        { id: 'en:palm-oil', text: 'palm oil' },
        { id: 'en:skimmed-milk', text: 'skimmed milk' },
        { id: 'en:soy-lecithin', text: 'soy lecithin' },
      ],
      allergens_tags: ['en:milk', 'en:soybeans'],
    },
  },
};

app.get('/__test/off/api/v2/product/:file', async (request, reply) => {
  const { file } = request.params as { file: string };
  const product = OFF_FIXTURES[file.replace('.json', '')];
  return product ? product : reply.status(404).send({ status: 0 });
});

app.get('/__test/mail', async (request) => {
  const { to } = request.query as { to: string };
  return mailer.outbox.filter((mail) => mail.to === to);
});

app.get('/__test/seed-demo', async (request) => {
  const { email, timezone } = request.query as { email: string; timezone?: string };
  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) return { inserted: 0 };
  return {
    inserted: await insertDemoEntries(db, user.id, { timezone: timezone ?? user.timezone }),
  };
});

app.get('/__test/feature', async (request) => {
  const { email, key, enabled } = request.query as { email: string; key: string; enabled: string };
  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) return { updated: false };
  await db
    .insert(userFeatureOverrides)
    .values({ userId: user.id, key, enabled: enabled === 'true' })
    .onDuplicateKeyUpdate({ set: { enabled: enabled === 'true' } });
  return { updated: true };
});

const E2E_TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const secretBox = createSecretBox(encryptionKeys(config));

async function makeAdmin(email: string, withSecondFactor = true) {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) return;
  await db.update(users).set({ role: 'admin' }).where(eq(users.id, user.id));
  if (!withSecondFactor) return;
  const secret = secretBox.encrypt(E2E_TOTP_SECRET, `${user.id}:totp`);
  await db
    .insert(mfaTotp)
    .values({ userId: user.id, secret, confirmedAt: new Date() })
    .onDuplicateKeyUpdate({ set: { secret, confirmedAt: new Date(), lastTimeStep: 0 } });
}

// Administrators need a second factor, so promoting enrolls a fixed authenticator secret.
app.get('/__test/promote', async (request) => {
  const { email, mfa } = request.query as { email: string; mfa?: string };
  await makeAdmin(email, mfa !== 'false');
  return { promoted: true };
});

app.get('/__test/only-admin', async (request) => {
  const { email } = request.query as { email: string };
  await db.update(users).set({ role: 'user' }).where(ne(users.email, email));
  await makeAdmin(email);
  return { onlyAdmin: true };
});

app.get('/__test/totp-now', async (request) => {
  const { secret, offset } = request.query as { secret: string; offset?: string };
  return {
    code: generateSync({ secret, epoch: Math.floor(Date.now() / 1000) + Number(offset ?? 0) }),
  };
});

app.get('/__test/totp-code', async (request) => {
  const { email } = request.query as { email: string };
  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (user) await db.update(mfaTotp).set({ lastTimeStep: 0 }).where(eq(mfaTotp.userId, user.id));
  return { code: generateSync({ secret: E2E_TOTP_SECRET }) };
});

app.get('/__test/invite', async () => {
  const token = newToken();
  await db.insert(invites).values({
    id: newId(),
    tokenHash: hashToken(token),
    expiresAt: inFuture(DAY),
  });
  return { token };
});

await app.listen({ port: config.PORT, host: config.HOST });
