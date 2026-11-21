import { eq } from 'drizzle-orm';
import { FEATURE_KEYS, resolveFlag, type FeatureFlags, type FeatureKey } from '@foodlog/shared';
import type { Database } from '../db/client.ts';
import { featureFlags, userFeatureOverrides } from '../db/schema.ts';

export async function resolveFeatures(db: Database, userId: string): Promise<FeatureFlags> {
  const [rows, overrides] = await Promise.all([
    db.select().from(featureFlags),
    db.select().from(userFeatureOverrides).where(eq(userFeatureOverrides.userId, userId)),
  ]);
  const flags = {} as FeatureFlags;
  for (const key of FEATURE_KEYS) {
    flags[key] = resolveFlag(
      rows.find((row) => row.key === key),
      key,
      overrides.find((override) => override.key === key)?.enabled,
    );
  }
  return flags;
}

export async function isFeatureEnabledGlobally(db: Database, key: FeatureKey): Promise<boolean> {
  const [row] = await db.select().from(featureFlags).where(eq(featureFlags.key, key));
  return resolveFlag(row, key, true);
}
