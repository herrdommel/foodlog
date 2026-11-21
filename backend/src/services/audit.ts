import { desc, eq } from 'drizzle-orm';
import type { AuditEntryDto } from '@foodlog/shared';
import type { Database } from '../db/client.ts';
import { adminAudit, users } from '../db/schema.ts';
import { newId } from '../lib/crypto.ts';

export async function recordAudit(
  db: Database,
  entry: { actorId: string; action: string; target?: string | null },
): Promise<void> {
  await db.insert(adminAudit).values({
    id: newId(),
    actorId: entry.actorId,
    action: entry.action,
    target: entry.target?.slice(0, 255) ?? null,
  });
}

export async function listAudit(db: Database, limit: number): Promise<AuditEntryDto[]> {
  const rows = await db
    .select({ entry: adminAudit, actor: users.email })
    .from(adminAudit)
    .leftJoin(users, eq(users.id, adminAudit.actorId))
    .orderBy(desc(adminAudit.createdAt), desc(adminAudit.id))
    .limit(limit);
  return rows.map(({ entry, actor }) => ({
    id: entry.id,
    actor,
    action: entry.action,
    target: entry.target,
    createdAt: entry.createdAt.toISOString(),
  }));
}
