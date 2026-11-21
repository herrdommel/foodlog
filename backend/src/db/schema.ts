import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  datetime,
  index,
  mysqlEnum,
  mysqlTable,
  int,
  primaryKey,
  text,
  tinyint,
  uniqueIndex,
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
  privacyConsentAt: datetime('privacy_consent_at'),
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

export const ingredients = mysqlTable(
  'ingredients',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    catalogKey: varchar('catalog_key', { length: 64 }).unique(),
    userId: varchar('user_id', { length: 36 }).references(() => users.id, { onDelete: 'cascade' }),
    nameDe: varchar('name_de', { length: 80 }).notNull(),
    nameEn: varchar('name_en', { length: 80 }).notNull(),
    createdAt: datetime('created_at').notNull().default(utcNow),
  },
  (table) => [index('ingredients_user_id_idx').on(table.userId)],
);

export const ingredientAllergens = mysqlTable(
  'ingredient_allergens',
  {
    ingredientId: varchar('ingredient_id', { length: 36 })
      .notNull()
      .references(() => ingredients.id, { onDelete: 'cascade' }),
    allergen: varchar('allergen', { length: 32 }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.ingredientId, table.allergen] })],
);

export const entries = mysqlTable(
  'entries',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: mysqlEnum('type', ['meal', 'drink', 'symptom', 'stool', 'medication']).notNull(),
    occurredAt: datetime('occurred_at').notNull(),
    title: varchar('title', { length: 120 }),
    note: text('note'),
    symptomType: varchar('symptom_type', { length: 32 }),
    severity: tinyint('severity'),
    bristol: tinyint('bristol'),
    createdAt: datetime('created_at').notNull().default(utcNow),
    updatedAt: datetime('updated_at')
      .notNull()
      .default(utcNow)
      .$onUpdate(() => new Date()),
  },
  (table) => [index('entries_user_occurred_idx').on(table.userId, table.occurredAt)],
);

export const entryIngredients = mysqlTable(
  'entry_ingredients',
  {
    entryId: varchar('entry_id', { length: 36 })
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    ingredientId: varchar('ingredient_id', { length: 36 })
      .notNull()
      .references(() => ingredients.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.entryId, table.ingredientId] }),
    index('entry_ingredients_ingredient_idx').on(table.ingredientId),
  ],
);

export const templates = mysqlTable(
  'templates',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    type: mysqlEnum('type', ['meal', 'drink', 'medication']).notNull(),
    title: varchar('title', { length: 120 }),
    createdAt: datetime('created_at').notNull().default(utcNow),
  },
  (table) => [uniqueIndex('templates_user_name_idx').on(table.userId, table.name)],
);

export const templateIngredients = mysqlTable(
  'template_ingredients',
  {
    templateId: varchar('template_id', { length: 36 })
      .notNull()
      .references(() => templates.id, { onDelete: 'cascade' }),
    ingredientId: varchar('ingredient_id', { length: 36 })
      .notNull()
      .references(() => ingredients.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.templateId, table.ingredientId] })],
);

export const adminAudit = mysqlTable(
  'admin_audit',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    actorId: varchar('actor_id', { length: 36 }).references(() => users.id, {
      onDelete: 'set null',
    }),
    action: varchar('action', { length: 48 }).notNull(),
    targetUserId: varchar('target_user_id', { length: 36 }).references(() => users.id, {
      onDelete: 'set null',
    }),
    detail: varchar('detail', { length: 255 }),
    createdAt: datetime('created_at').notNull().default(utcNow),
  },
  (table) => [index('admin_audit_created_idx').on(table.createdAt)],
);

export const aiKeys = mysqlTable(
  'ai_keys',
  {
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: mysqlEnum('provider', ['anthropic', 'openai']).notNull(),
    ciphertext: text('ciphertext').notNull(),
    last4: varchar('last4', { length: 4 }).notNull(),
    createdAt: datetime('created_at').notNull().default(utcNow),
  },
  (table) => [primaryKey({ columns: [table.userId, table.provider] })],
);

export const aiSettings = mysqlTable('ai_settings', {
  userId: varchar('user_id', { length: 36 })
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: mysqlEnum('provider', ['anthropic', 'openai']),
  model: varchar('model', { length: 100 }),
  consentVersion: int('consent_version'),
  consentAt: datetime('consent_at'),
});
