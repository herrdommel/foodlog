import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  datetime,
  index,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  varchar,
} from 'drizzle-orm/mysql-core';

const mediumBlob = customType<{ data: Buffer }>({
  dataType: () => 'mediumblob',
});

const utcNow = sql`CURRENT_TIMESTAMP`;

export const users = mysqlTable('users', {
  id: varchar('id', { length: 36 }).primaryKey(),
  email: varchar('email', { length: 254 }).notNull().unique(),
  emailVerifiedAt: datetime('email_verified_at'),
  passwordHash: varchar('password_hash', { length: 255 }),
  name: varchar('name', { length: 100 }).notNull(),
  avatar: varchar('avatar', { length: 16 }).notNull().default('preset:1'),
  role: mysqlEnum('role', ['user', 'admin']).notNull().default('user'),
  active: boolean('active').notNull().default(true),
  locale: mysqlEnum('locale', ['de', 'en']).notNull().default('de'),
  timezone: varchar('timezone', { length: 64 }).notNull().default('Europe/Berlin'),
  createdAt: datetime('created_at').notNull().default(utcNow),
  updatedAt: datetime('updated_at')
    .notNull()
    .default(utcNow)
    .$onUpdate(() => new Date()),
});

export const userAvatars = mysqlTable('user_avatars', {
  userId: varchar('user_id', { length: 36 })
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  data: mediumBlob('data').notNull(),
  updatedAt: datetime('updated_at').notNull().default(utcNow),
});

export const sessions = mysqlTable(
  'sessions',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: datetime('expires_at').notNull(),
    lastUsedAt: datetime('last_used_at').notNull().default(utcNow),
    createdAt: datetime('created_at').notNull().default(utcNow),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
);

export const authTokens = mysqlTable(
  'auth_tokens',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: mysqlEnum('type', ['verify_email', 'reset_password', 'change_email']).notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
    newEmail: varchar('new_email', { length: 254 }),
    expiresAt: datetime('expires_at').notNull(),
    usedAt: datetime('used_at'),
    createdAt: datetime('created_at').notNull().default(utcNow),
  },
  (table) => [index('auth_tokens_user_type_idx').on(table.userId, table.type)],
);

export const invites = mysqlTable('invites', {
  id: varchar('id', { length: 36 }).primaryKey(),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  email: varchar('email', { length: 254 }),
  createdBy: varchar('created_by', { length: 36 }).references(() => users.id, {
    onDelete: 'set null',
  }),
  expiresAt: datetime('expires_at').notNull(),
  usedAt: datetime('used_at'),
  usedBy: varchar('used_by', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  createdAt: datetime('created_at').notNull().default(utcNow),
});

export const oauthAccounts = mysqlTable(
  'oauth_accounts',
  {
    provider: varchar('provider', { length: 32 }).notNull(),
    providerUserId: varchar('provider_user_id', { length: 128 }).notNull(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: datetime('created_at').notNull().default(utcNow),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.providerUserId] }),
    index('oauth_accounts_user_id_idx').on(table.userId),
  ],
);

export const settings = mysqlTable('settings', {
  key: varchar('key', { length: 64 }).primaryKey(),
  value: varchar('value', { length: 255 }).notNull(),
});

export const featureFlags = mysqlTable('feature_flags', {
  key: varchar('key', { length: 64 }).primaryKey(),
  enabled: boolean('enabled').notNull().default(true),
  defaultForUsers: boolean('default_for_users').notNull().default(false),
});

export const userFeatureOverrides = mysqlTable(
  'user_feature_overrides',
  {
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 64 }).notNull(),
    enabled: boolean('enabled').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.key] })],
);
