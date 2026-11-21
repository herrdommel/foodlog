import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  inviteCreateSchema,
  type CreatedInviteDto,
  type InviteDto,
  type InviteStatus,
} from '@foodlog/shared';
import { z } from 'zod';
import type { AppDeps } from '../app.ts';
import { invites, users } from '../db/schema.ts';
import { hashToken, newId, newToken } from '../lib/crypto.ts';
import { AppError, parseBody } from '../lib/errors.ts';
import { DAY, inFuture } from '../lib/time.ts';
import { recordAudit } from '../services/audit.ts';
import { renderMail } from '../services/mail-templates.ts';

function toDto(row: typeof invites.$inferSelect, usedByEmail: string | null): InviteDto {
  const status: InviteStatus = row.usedAt
    ? 'used'
    : row.expiresAt.getTime() < Date.now()
      ? 'expired'
      : 'open';
  return {
    id: row.id,
    email: row.email,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    usedAt: row.usedAt?.toISOString() ?? null,
    usedByEmail,
    status,
  };
}

export async function adminInviteRoutes(app: FastifyInstance, { config, db, mailer }: AppDeps) {
  const admin = { preHandler: app.requireAdmin };

  app.get('/api/admin/invites', admin, async (): Promise<InviteDto[]> => {
    const rows = await db
      .select({ invite: invites, usedBy: users.email })
      .from(invites)
      .leftJoin(users, eq(users.id, invites.usedBy))
      .orderBy(desc(invites.createdAt))
      .limit(100);
    return rows.map(({ invite, usedBy }) => toDto(invite, usedBy));
  });

  app.post(
    '/api/admin/invites',
    { ...admin, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = parseBody(inviteCreateSchema, request.body);
      const actor = request.user!;
      const token = newToken();
      const id = newId();
      await db.insert(invites).values({
        id,
        tokenHash: hashToken(token),
        email: body.email ?? null,
        createdBy: actor.id,
        expiresAt: inFuture(body.expiresInDays * DAY),
      });
      const link = `${config.APP_URL}/register?invite=${token}`;

      let emailSent = false;
      if (body.sendMail && body.email) {
        try {
          await mailer.send(renderMail('invite', actor.locale, body.email, { url: link }));
          emailSent = true;
        } catch (error) {
          app.log.error(error, 'failed to send invitation');
        }
      }
      await recordAudit(db, {
        actorId: actor.id,
        action: 'invite.create',
      });

      const [row] = await db.select().from(invites).where(eq(invites.id, id));
      const created: CreatedInviteDto = { ...toDto(row!, null), link, emailSent };
      return reply.status(201).send(created);
    },
  );

  app.delete('/api/admin/invites/:id', admin, async (request, reply) => {
    const { id } = parseBody(z.object({ id: z.uuid() }), request.params);
    const [row] = await db.select().from(invites).where(eq(invites.id, id));
    if (!row) throw new AppError(404, 'not_found', 'Invitation not found');
    if (row.usedAt) throw new AppError(409, 'invite_used', 'This invitation was already used');
    await db.delete(invites).where(eq(invites.id, id));
    await recordAudit(db, { actorId: request.user!.id, action: 'invite.revoke' });
    return reply.status(204).send();
  });
}
