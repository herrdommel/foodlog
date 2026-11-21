import { inArray } from 'drizzle-orm';
import { syncCatalog } from '../catalog/sync.ts';
import { loadConfig } from '../config.ts';
import { newId } from '../lib/crypto.ts';
import { hashPassword } from '../lib/password.ts';
import { createDb } from './client.ts';
import { insertDemoEntries } from './demo-data.ts';
import { users } from './schema.ts';

const config = loadConfig();
if (config.NODE_ENV === 'production') {
  console.error('Refusing to seed demo data in production');
  process.exit(1);
}

const DEMO = { email: 'demo@example.com', password: 'demo-password-123', name: 'Demo User' };
const ADMIN = { email: 'admin@example.com', password: 'admin-password-123', name: 'Demo Admin' };
const TIMEZONE = 'Europe/Berlin';

const { db, pool } = createDb(config.DATABASE_URL);

try {
  await syncCatalog(db);
  await db.delete(users).where(inArray(users.email, [DEMO.email, ADMIN.email]));

  const demoId = newId();
  await db.insert(users).values([
    {
      id: demoId,
      email: DEMO.email,
      name: DEMO.name,
      passwordHash: await hashPassword(DEMO.password),
      emailVerifiedAt: new Date(),
      avatar: 'preset:3',
      locale: 'de',
      timezone: TIMEZONE,
    },
    {
      id: newId(),
      email: ADMIN.email,
      name: ADMIN.name,
      passwordHash: await hashPassword(ADMIN.password),
      emailVerifiedAt: new Date(),
      avatar: 'preset:8',
      role: 'admin',
      locale: 'en',
      timezone: TIMEZONE,
    },
  ]);

  const count = await insertDemoEntries(db, demoId);

  console.log(`Seeded ${count} entries for ${DEMO.email} (password: ${DEMO.password})`);
  console.log(`Admin: ${ADMIN.email} (password: ${ADMIN.password})`);
} finally {
  await pool.end();
}
