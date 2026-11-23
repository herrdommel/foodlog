import { sql } from 'drizzle-orm';
import type { Locale } from '@foodlog/shared';
import {
  boolean,
  customType,
  datetime,
  index,
  mysqlEnum,
  mysqlTable,
  int,
  primaryKey,
  smallint,
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
  locale: varchar('locale', { length: 8 }).$type<Locale>().notNull().default('de'),
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
    type: mysqlEnum('type', [
      'verify_email',
      'reset_password',
      'change_email',
      'approve_email_change',
    ]).notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
    newEmail: varchar('new_email', { length: 254 }),
    expiresAt: datetime('expires_at').notNull(),
    usedAt: datetime('used_at'),
    createdAt: datetime('created_at').notNull().default(utcNow),
  },
  (table) => [index('auth_tokens_user_type_idx').on(table.userId, table.type)],
);

export const loginAttempts = mysqlTable('login_attempts', {
  emailHash: varchar('email_hash', { length: 64 }).primaryKey(),
  failures: int('failures').notNull(),
  windowStartedAt: datetime('window_started_at').notNull(),
});

export const mfaTotp = mysqlTable('mfa_totp', {
  userId: varchar('user_id', { length: 36 })
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  secret: varchar('secret', { length: 255 }).notNull(),
  confirmedAt: datetime('confirmed_at'),
  lastTimeStep: int('last_time_step').notNull().default(0),
  createdAt: datetime('created_at').notNull().default(utcNow),
});

export const passkeys = mysqlTable(
  'passkeys',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    credentialId: varchar('credential_id', { length: 700 }).notNull().unique(),
    publicKey: mediumBlob('public_key').notNull(),
    counter: int('counter').notNull().default(0),
    transports: varchar('transports', { length: 120 }),
    backedUp: boolean('backed_up').notNull().default(false),
    name: varchar('name', { length: 60 }).notNull(),
    createdAt: datetime('created_at').notNull().default(utcNow),
    lastUsedAt: datetime('last_used_at'),
  },
  (table) => [index('passkeys_user_id_idx').on(table.userId)],
);

export const mfaRecoveryCodes = mysqlTable(
  'mfa_recovery_codes',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: varchar('code_hash', { length: 64 }).notNull(),
    usedAt: datetime('used_at'),
  },
  (table) => [index('mfa_recovery_codes_user_id_idx').on(table.userId)],
);

export const loginChallenges = mysqlTable(
  'login_challenges',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    attempts: int('attempts').notNull().default(0),
    expiresAt: datetime('expires_at').notNull(),
  },
  (table) => [index('login_challenges_user_id_idx').on(table.userId)],
);

export const webauthnChallenges = mysqlTable(
  'webauthn_challenges',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    userId: varchar('user_id', { length: 36 }).references(() => users.id, {
      onDelete: 'cascade',
    }),
    purpose: mysqlEnum('purpose', ['register', 'login_mfa', 'login']).notNull(),
    challenge: varchar('challenge', { length: 255 }).notNull(),
    expiresAt: datetime('expires_at').notNull(),
  },
  (table) => [index('webauthn_challenges_user_id_idx').on(table.userId)],
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
    createdAt: datetime('created_at').notNull().default(utcNow),
  },
  (table) => [index('ingredients_user_id_idx').on(table.userId)],
);

export const ingredientNames = mysqlTable(
  'ingredient_names',
  {
    ingredientId: varchar('ingredient_id', { length: 36 })
      .notNull()
      .references(() => ingredients.id, { onDelete: 'cascade' }),
    locale: varchar('locale', { length: 8 }).notNull(),
    name: varchar('name', { length: 80 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ingredientId, table.locale] }),
    index('ingredient_names_name_idx').on(table.name),
  ],
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
    type: mysqlEnum('type', [
      'meal',
      'drink',
      'symptom',
      'stool',
      'medication',
      'sleep',
      'stress',
    ]).notNull(),
    occurredAt: datetime('occurred_at').notNull(),
    title: varchar('title', { length: 120 }),
    note: text('note'),
    symptomType: varchar('symptom_type', { length: 32 }),
    severity: tinyint('severity'),
    bristol: tinyint('bristol'),
    sleepMinutes: smallint('sleep_minutes'),
    rating: tinyint('rating'),
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
  photoConsentVersion: int('photo_consent_version'),
  photoConsentAt: datetime('photo_consent_at'),
});
