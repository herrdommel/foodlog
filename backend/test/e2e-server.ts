import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { syncCatalog } from '../src/catalog/sync.ts';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { createDb } from '../src/db/client.ts';
import { insertDemoEntries } from '../src/db/demo-data.ts';
import { invites, userFeatureOverrides, users } from '../src/db/schema.ts';
import { hashToken, newId, newToken } from '../src/lib/crypto.ts';
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

app.get('/__test/promote', async (request) => {
  const { email } = request.query as { email: string };
  await db.update(users).set({ role: 'admin' }).where(eq(users.email, email));
  return { promoted: true };
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
