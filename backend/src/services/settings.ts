import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.ts';
import { settings } from '../db/schema.ts';

export async function getBooleanSetting(
  db: Database,
  key: string,
  fallback: boolean,
): Promise<boolean> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  return row ? row.value === 'true' : fallback;
}

export async function setBooleanSetting(db: Database, key: string, value: boolean): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value: String(value) })
    .onDuplicateKeyUpdate({ set: { value: String(value) } });
}

export const PUBLIC_REGISTRATION = 'public_registration';
