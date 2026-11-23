import { count, eq, inArray } from 'drizzle-orm';
import {
  FEATURE_DEFAULTS,
  FEATURE_KEYS,
  resolveFlag,
  type AdminUserDetailDto,
  type AdminUserDto,
} from '@foodlog/shared';
import type { Database } from '../db/client.ts';
import {
  entries,
  featureFlags,
  mfaTotp,
  oauthAccounts,
  passkeys,
  userFeatureOverrides,
} from '../db/schema.ts';
import type { UserRow } from './users.ts';

export async function toAdminUsers(db: Database, rows: UserRow[]): Promise<AdminUserDto[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [entryCounts, linked] = await Promise.all([
    db
      .select({ userId: entries.userId, total: count() })
      .from(entries)
      .where(inArray(entries.userId, ids))
      .groupBy(entries.userId),
    db
      .select({ userId: oauthAccounts.userId })
      .from(oauthAccounts)
      .where(inArray(oauthAccounts.userId, ids)),
  ]);
  const totals = new Map(entryCounts.map((row) => [row.userId, row.total]));
  const googleUsers = new Set(linked.map((row) => row.userId));
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    active: row.active,
    emailVerified: row.emailVerifiedAt !== null,
    locale: row.locale,
    timezone: row.timezone,
    createdAt: row.createdAt.toISOString(),
    googleLinked: googleUsers.has(row.id),
    hasPassword: row.passwordHash !== null,
    entryCount: totals.get(row.id) ?? 0,
  }));
}

export async function toAdminUserDetail(db: Database, row: UserRow): Promise<AdminUserDetailDto> {
  const [[dto], flags, overrides, [totp], keys] = await Promise.all([
    toAdminUsers(db, [row]),
    db.select().from(featureFlags),
    db.select().from(userFeatureOverrides).where(eq(userFeatureOverrides.userId, row.id)),
    db.select().from(mfaTotp).where(eq(mfaTotp.userId, row.id)),
    db.select({ id: passkeys.id }).from(passkeys).where(eq(passkeys.userId, row.id)),
  ]);
  return {
    ...dto!,
    mfaEnabled: Boolean(totp?.confirmedAt) || keys.length > 0,
    features: FEATURE_KEYS.map((key) => {
      const flag = flags.find((item) => item.key === key);
      const override = overrides.find((item) => item.key === key)?.enabled ?? null;
      return {
        key,
        globalEnabled: flag?.enabled ?? FEATURE_DEFAULTS[key].enabled,
        defaultForUsers: flag?.defaultForUsers ?? FEATURE_DEFAULTS[key].defaultForUsers,
        override,
        effective: resolveFlag(flag, key, override ?? undefined),
      };
    }),
  };
}
