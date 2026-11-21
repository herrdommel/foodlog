import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { syncCatalog } from '../src/catalog/sync.ts';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { createDb } from '../src/db/client.ts';
import { invites } from '../src/db/schema.ts';
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
const app = await buildApp({ config, db, mailer });

app.get('/__test/mail', async (request) => {
  const { to } = request.query as { to: string };
  return mailer.outbox.filter((mail) => mail.to === to);
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
