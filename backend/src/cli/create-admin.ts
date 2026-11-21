import { eq } from 'drizzle-orm';
import { emailSchema, nameSchema, passwordSchema } from '@foodlog/shared';
import { loadConfig } from '../config.ts';
import { createDb } from '../db/client.ts';
import { users } from '../db/schema.ts';
import { newId } from '../lib/crypto.ts';
import { hashPassword } from '../lib/password.ts';
import { randomPresetAvatar } from '../services/users.ts';

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks)
    .toString('utf8')
    .replace(/\r?\n$/, '');
}

const [rawEmail, rawName] = process.argv.slice(2);
if (!rawEmail || !rawName || process.stdin.isTTY) {
  console.error('Usage: printf "%s" "$PASSWORD" | pnpm admin:create <email> <name>');
  process.exit(1);
}

const email = emailSchema.parse(rawEmail);
const name = nameSchema.parse(rawName);
const password = passwordSchema.parse(await readStdin());

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);
try {
  const passwordHash = await hashPassword(password);
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    await db
      .update(users)
      .set({
        role: 'admin',
        active: true,
        passwordHash,
        emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
      })
      .where(eq(users.id, existing.id));
    console.log(`Updated ${email} to admin`);
  } else {
    await db.insert(users).values({
      id: newId(),
      email,
      name,
      passwordHash,
      role: 'admin',
      emailVerifiedAt: new Date(),
      avatar: randomPresetAvatar(),
    });
    console.log(`Created admin ${email}`);
  }
} finally {
  await pool.end();
}
