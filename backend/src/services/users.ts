import { count, eq } from 'drizzle-orm';
import type { PublicUser } from '@foodlog/shared';
import type { Database } from '../db/client.ts';
import { oauthAccounts, userAvatars, users } from '../db/schema.ts';

export type UserRow = typeof users.$inferSelect;

export async function findUserByEmail(db: Database, email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user;
}

export async function toPublicUser(db: Database, user: UserRow): Promise<PublicUser> {
  const [linked] = await db
    .select({ total: count() })
    .from(oauthAccounts)
    .where(eq(oauthAccounts.userId, user.id));
  const [avatar] =
    user.avatar === 'upload'
      ? await db
          .select({ updatedAt: userAvatars.updatedAt })
          .from(userAvatars)
          .where(eq(userAvatars.userId, user.id))
      : [];
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    avatarVersion: avatar?.updatedAt.getTime() ?? 0,
    role: user.role,
    locale: user.locale,
    timezone: user.timezone,
    hasPassword: user.passwordHash !== null,
    googleLinked: (linked?.total ?? 0) > 0,
  };
}

export function randomPresetAvatar(): string {
  return `preset:${1 + Math.floor(Math.random() * 12)}`;
}
