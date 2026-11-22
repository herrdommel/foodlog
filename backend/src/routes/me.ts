import { and, count, eq } from 'drizzle-orm';
import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';
import {
  changeEmailSchema,
  deleteAccountSchema,
  tokenBodySchema,
  updateProfileSchema,
  type MeResponse,
} from '@foodlog/shared';
import type { AppDeps } from '../app.ts';
import { userAvatars, users } from '../db/schema.ts';
import { clearSessionCookie } from '../lib/cookies.ts';
import { AppError, parseBody } from '../lib/errors.ts';
import { verifyPassword } from '../lib/password.ts';
import { createAuthMail } from '../services/auth-mail.ts';
import { resolveFeatures } from '../services/features.ts';
import { buildAccountExport } from '../services/account-export.ts';
import { deleteUserSessions } from '../services/sessions.ts';
import { consumeAuthToken } from '../services/tokens.ts';
import { findUserByEmail, toPublicUser, type UserRow } from '../services/users.ts';

const AVATAR_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif']);

export async function meRoutes(app: FastifyInstance, { config, db, mailer }: AppDeps) {
  const authMail = createAuthMail({ config, db, mailer, log: app.log });
  const auth = { preHandler: app.requireUser };

  async function meResponse(user: UserRow): Promise<MeResponse> {
    return { user: await toPublicUser(db, user), features: await resolveFeatures(db, user.id) };
  }

  async function reload(userId: string): Promise<UserRow> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    return user!;
  }

  app.get('/api/me', auth, async (request) => meResponse(request.user!));

  app.patch('/api/me', auth, async (request) => {
    const body = parseBody(updateProfileSchema, request.body);
    const user = request.user!;
    if (body.avatar === 'upload') {
      const [existing] = await db
        .select({ userId: userAvatars.userId })
        .from(userAvatars)
        .where(eq(userAvatars.userId, user.id));
      if (!existing) throw new AppError(400, 'no_uploaded_avatar', 'No uploaded avatar available');
    }
    await db.update(users).set(body).where(eq(users.id, user.id));
    if (body.avatar && body.avatar !== 'upload') {
      await db.delete(userAvatars).where(eq(userAvatars.userId, user.id));
    }
    return meResponse(await reload(user.id));
  });

  app.post(
    '/api/me/avatar',
    { ...auth, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request) => {
      const file = await request.file();
      if (!file) throw new AppError(400, 'file_required', 'No file uploaded');
      const input = await file.toBuffer();
      let data: Buffer;
      try {
        const image = sharp(input, { limitInputPixels: 25_000_000 });
        const metadata = await image.metadata();
        if (!metadata.format || !AVATAR_FORMATS.has(metadata.format)) throw new Error('format');
        data = await image
          .rotate()
          .resize(256, 256, { fit: 'cover' })
          .webp({ quality: 85 })
          .toBuffer();
      } catch {
        throw new AppError(400, 'invalid_image', 'The file is not a supported image');
      }
      const user = request.user!;
      await db
        .insert(userAvatars)
        .values({ userId: user.id, data })
        .onDuplicateKeyUpdate({ set: { data, updatedAt: new Date() } });
      await db.update(users).set({ avatar: 'upload' }).where(eq(users.id, user.id));
      return meResponse(await reload(user.id));
    },
  );

  app.get('/api/me/avatar', auth, async (request, reply) => {
    const [row] = await db
      .select()
      .from(userAvatars)
      .where(eq(userAvatars.userId, request.user!.id));
    if (!row) throw new AppError(404, 'not_found', 'No uploaded avatar');
    return reply
      .header('content-type', 'image/webp')
      .header('cache-control', 'private, max-age=300')
      .send(row.data);
  });

  app.post(
    '/api/me/email',
    { ...auth, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = parseBody(changeEmailSchema, request.body);
      const user = request.user!;
      if (user.passwordHash) {
        if (!body.password || !(await verifyPassword(user.passwordHash, body.password))) {
          throw new AppError(403, 'invalid_password', 'The password is incorrect');
        }
      }
      if (body.newEmail === user.email) {
        throw new AppError(400, 'same_email', 'This is already your email address');
      }
      const owner = await findUserByEmail(db, body.newEmail);
      if (owner) {
        await authMail.sendReset(owner, 'accountExists');
      } else if (user.passwordHash) {
        await authMail.sendEmailChange(user, body.newEmail);
      } else {
        // No password to re-authenticate with, so the current mailbox has to approve the change.
        await authMail.sendEmailChangeApproval(user, body.newEmail);
      }
      return reply.status(202).send({ status: 'confirmation_sent' });
    },
  );

  app.post(
    '/api/me/email/confirm',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request) => {
      const { token } = parseBody(tokenBodySchema, request.body);
      const row = await consumeAuthToken(db, token, ['change_email', 'approve_email_change']);
      if (!row.newEmail) throw new AppError(400, 'invalid_token', 'The link is invalid');
      if (await findUserByEmail(db, row.newEmail)) {
        throw new AppError(409, 'email_taken', 'This email address is already in use');
      }
      const approvedByOldAddress = row.type === 'approve_email_change';
      await db
        .update(users)
        .set({ email: row.newEmail, emailVerifiedAt: approvedByOldAddress ? null : new Date() })
        .where(eq(users.id, row.userId));
      const keep = request.user?.id === row.userId ? request.sessionId : null;
      await deleteUserSessions(db, row.userId, keep ?? undefined);
      if (approvedByOldAddress) {
        await authMail.sendVerification({ ...(await reload(row.userId)) });
        return { status: 'verification_sent' };
      }
      return { status: 'email_changed' };
    },
  );

  app.post(
    '/api/me/password-reset',
    { ...auth, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      await authMail.sendReset(request.user!);
      return reply.status(202).send({ status: 'ok' });
    },
  );

  app.get('/api/me/export', auth, async (request, reply) => {
    const data = await buildAccountExport(db, request.user!);
    const day = new Date().toISOString().slice(0, 10);
    return reply
      .header('content-type', 'application/json; charset=utf-8')
      .header('content-disposition', `attachment; filename="foodlog-export-${day}.json"`)
      .header('cache-control', 'no-store')
      .send(JSON.stringify(data, null, 2));
  });

  app.post(
    '/api/me/delete',
    { ...auth, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = parseBody(deleteAccountSchema, request.body);
      const user = request.user!;
      if (body.confirmEmail !== user.email) {
        throw new AppError(400, 'email_mismatch', 'The email address does not match');
      }
      if (user.passwordHash) {
        if (!body.password || !(await verifyPassword(user.passwordHash, body.password))) {
          throw new AppError(403, 'invalid_password', 'The password is incorrect');
        }
      }
      if (user.role === 'admin') {
        const [admins] = await db
          .select({ total: count() })
          .from(users)
          .where(and(eq(users.role, 'admin'), eq(users.active, true)));
        if ((admins?.total ?? 0) <= 1) {
          throw new AppError(409, 'last_admin', 'The last administrator cannot delete the account');
        }
      }
      await db.delete(users).where(eq(users.id, user.id));
      clearSessionCookie(reply, config);
      return reply.status(204).send();
    },
  );
}
