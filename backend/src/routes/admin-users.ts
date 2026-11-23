import { and, count, desc, eq, like, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  adminUsersQuerySchema,
  adminUserUpdateSchema,
  featureKeySchema,
  resetLinkSchema,
  userFeatureSchema,
  type AdminUsersPageDto,
  type ResetLinkDto,
} from '@foodlog/shared';
import { z } from 'zod';
import type { AppDeps } from '../app.ts';
import { userFeatureOverrides, users } from '../db/schema.ts';
import { AppError, parseBody } from '../lib/errors.ts';
import { HOUR } from '../lib/time.ts';
import { toAdminUserDetail, toAdminUsers } from '../services/admin-users.ts';
import { recordAudit } from '../services/audit.ts';
import { createAuthMail } from '../services/auth-mail.ts';
import { createMfaService } from '../services/mfa.ts';
import { deleteUserSessions } from '../services/sessions.ts';
import { createAuthToken } from '../services/tokens.ts';
import { findUserByEmail } from '../services/users.ts';

const idSchema = z.object({ id: z.uuid() });

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function adminUserRoutes(app: FastifyInstance, { config, db, mailer }: AppDeps) {
  const admin = { preHandler: app.requireAdmin };
  const authMail = createAuthMail({ config, db, mailer, log: app.log });
  const mfa = createMfaService({ config, db });

  async function target(id: string) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    if (!user) throw new AppError(404, 'not_found', 'User not found');
    return user;
  }

  app.get('/api/admin/users', admin, async (request): Promise<AdminUsersPageDto> => {
    const { q, page, pageSize } = parseBody(adminUsersQuerySchema, request.query);
    const pattern = `%${escapeLike(q)}%`;
    const where = q ? or(like(users.email, pattern), like(users.name, pattern)) : undefined;
    const [rows, [totals]] = await Promise.all([
      db
        .select()
        .from(users)
        .where(where)
        .orderBy(desc(users.createdAt), users.email)
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ total: count() }).from(users).where(where),
    ]);
    return { users: await toAdminUsers(db, rows), total: totals?.total ?? 0, page, pageSize };
  });

  app.get('/api/admin/users/:id', admin, async (request) => {
    const { id } = parseBody(idSchema, request.params);
    return toAdminUserDetail(db, await target(id));
  });

  app.patch('/api/admin/users/:id', admin, async (request) => {
    const { id } = parseBody(idSchema, request.params);
    const body = parseBody(adminUserUpdateSchema, request.body);
    const actor = request.user!;
    const user = await target(id);

    const demotes = body.role === 'user' && user.role === 'admin';
    const deactivates = body.active === false && user.active;
    if (user.id === actor.id && (demotes || body.active === false)) {
      throw new AppError(400, 'cannot_modify_self', 'You cannot demote or deactivate yourself');
    }

    const emailChanged = body.email !== undefined && body.email !== user.email;
    if (emailChanged) {
      const existing = await findUserByEmail(db, body.email!);
      if (existing && existing.id !== user.id) {
        throw new AppError(409, 'email_taken', 'This email address is already in use');
      }
    }

    await db
      .update(users)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.role !== undefined && { role: body.role }),
        ...(body.active !== undefined && { active: body.active }),
        ...(emailChanged && { email: body.email!, emailVerifiedAt: null }),
      })
      .where(eq(users.id, id));

    if (deactivates || emailChanged) await deleteUserSessions(db, id);

    if (body.name !== undefined && body.name !== user.name) {
      await recordAudit(db, { actorId: actor.id, action: 'user.rename', targetUserId: id });
    }
    if (body.role !== undefined && body.role !== user.role) {
      await recordAudit(db, {
        actorId: actor.id,
        action: `user.role.${body.role}`,
        targetUserId: id,
      });
    }
    if (body.active !== undefined && body.active !== user.active) {
      await recordAudit(db, {
        actorId: actor.id,
        action: body.active ? 'user.activate' : 'user.deactivate',
        targetUserId: id,
      });
    }

    const updated = await target(id);
    if (emailChanged) {
      await recordAudit(db, {
        actorId: actor.id,
        action: 'user.email',
        targetUserId: id,
      });
      await authMail.sendVerification(updated);
    }
    return toAdminUserDetail(db, updated);
  });

  app.post(
    '/api/admin/users/:id/reset-link',
    { ...admin, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request): Promise<ResetLinkDto> => {
      const { id } = parseBody(idSchema, request.params);
      const { delivery } = parseBody(resetLinkSchema, request.body);
      const user = await target(id);
      if (!user.active) throw new AppError(409, 'account_disabled', 'This account is disabled');

      let link: string | null = null;
      if (delivery === 'email') {
        try {
          await authMail.sendReset(user, 'resetPassword', { strict: true });
        } catch (error) {
          app.log.error(error, 'failed to send reset mail');
          throw new AppError(502, 'mail_failed', 'The email could not be sent');
        }
      } else {
        const token = await createAuthToken(db, {
          userId: user.id,
          type: 'reset_password',
          ttlMs: HOUR,
        });
        link = `${config.APP_URL}/reset-password?token=${token}`;
      }
      await recordAudit(db, {
        actorId: request.user!.id,
        action: `user.reset_link.${delivery}`,
        targetUserId: user.id,
      });
      return { delivery, link };
    },
  );

  app.post(
    '/api/admin/users/:id/mfa-reset',
    { ...admin, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { id } = parseBody(idSchema, request.params);
      const actor = request.user!;
      if (id === actor.id) {
        throw new AppError(409, 'cannot_modify_self', 'You cannot change your own account here');
      }
      const user = await target(id);
      await mfa.clearAll(user.id);
      await deleteUserSessions(db, user.id);
      await recordAudit(db, { actorId: actor.id, action: 'user.mfa_reset', targetUserId: user.id });
      return reply.status(204).send();
    },
  );

  app.put('/api/admin/users/:id/features/:key', admin, async (request) => {
    const { id } = parseBody(idSchema, request.params);
    const key = parseBody(z.object({ key: featureKeySchema }), request.params).key;
    const { enabled } = parseBody(userFeatureSchema, request.body);
    const user = await target(id);
    if (enabled === null) {
      await db
        .delete(userFeatureOverrides)
        .where(and(eq(userFeatureOverrides.userId, id), eq(userFeatureOverrides.key, key)));
    } else {
      await db
        .insert(userFeatureOverrides)
        .values({ userId: id, key, enabled })
        .onDuplicateKeyUpdate({ set: { enabled } });
    }
    await recordAudit(db, {
      actorId: request.user!.id,
      action: 'user.feature',
      targetUserId: user.id,
      detail: `${key}=${enabled === null ? 'default' : enabled}`,
    });
    return toAdminUserDetail(db, user);
  });
}
