import { boolean, mysqlTable, varchar } from 'drizzle-orm/mysql-core';

export const featureFlags = mysqlTable('feature_flags', {
  key: varchar('key', { length: 64 }).primaryKey(),
  enabled: boolean('enabled').notNull().default(true),
  defaultForUsers: boolean('default_for_users').notNull().default(false),
});
