import { desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import type { AuditEntryDto, AuditPersonDto } from '@foodlog/shared';
import type { Database } from '../db/client.ts';
import { adminAudit, users } from '../db/schema.ts';
import { newId } from '../lib/crypto.ts';

export async function recordAudit(
  db: Database,
  entry: { actorId: string; action: string; targetUserId?: string | null; detail?: string | null },
): Promise<void> {
  await db.insert(adminAudit).values({
    id: newId(),
    actorId: entry.actorId,
    action: entry.action,
    targetUserId: entry.targetUserId ?? null,
    detail: entry.detail?.slice(0, 255) ?? null,
  });
}

function person(
  row: { id: string | null; name: string | null; email: string | null } | null,
): AuditPersonDto | null {
  return row?.id && row.name !== null && row.email !== null
    ? { id: row.id, name: row.name, email: row.email }
    : null;
}

export async function listAudit(db: Database, limit: number): Promise<AuditEntryDto[]> {
  const target = alias(users, 'target_user');
  const rows = await db
    .select({
      entry: adminAudit,
      actorId: users.id,
      actorName: users.name,
      actorEmail: users.email,
      targetId: target.id,
      targetName: target.name,
      targetEmail: target.email,
    })
    .from(adminAudit)
    .leftJoin(users, eq(users.id, adminAudit.actorId))
    .leftJoin(target, eq(target.id, adminAudit.targetUserId))
    .orderBy(desc(adminAudit.createdAt), desc(adminAudit.id))
    .limit(limit);
  return rows.map((row) => ({
    id: row.entry.id,
    actor: person({ id: row.actorId, name: row.actorName, email: row.actorEmail }),
    targetUser: person({ id: row.targetId, name: row.targetName, email: row.targetEmail }),
    action: row.entry.action,
    detail: row.entry.detail,
    createdAt: row.entry.createdAt.toISOString(),
  }));
}
