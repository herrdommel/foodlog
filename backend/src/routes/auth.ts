import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  tokenBodySchema,
  emailSchema,
  type AuthConfig,
} from '@foodlog/shared';
import { z } from 'zod';
import type { AppDeps } from '../app.ts';
import { invites, users } from '../db/schema.ts';
import { clearSessionCookie, SESSION_COOKIE, setSessionCookie } from '../lib/cookies.ts';
import { hashToken, newId } from '../lib/crypto.ts';
import { AppError, parseBody } from '../lib/errors.ts';
import { hashPassword, verifyPassword } from '../lib/password.ts';
import { isFeatureEnabledGlobally } from '../services/features.ts';
import { createAuthMail } from '../services/auth-mail.ts';
import { PUBLIC_REGISTRATION, getBooleanSetting } from '../services/settings.ts';
import {
  clearLoginFailures,
  isLoginLocked,
  recordLoginFailure,
} from '../services/login-throttle.ts';
import { createSession, deleteSession, deleteUserSessions } from '../services/sessions.ts';
import { consumeAuthToken } from '../services/tokens.ts';
import { findUserByEmail, randomPresetAvatar, toPublicUser } from '../services/users.ts';

const strict = { rateLimit: { max: 10, timeWindow: '1 minute' } };
const mailLimited = { rateLimit: { max: 5, timeWindow: '1 minute' } };

export async function authRoutes(app: FastifyInstance, { config, db, mailer }: AppDeps) {
  const authMail = createAuthMail({ config, db, mailer, log: app.log });

  app.get('/api/auth/config', async (): Promise<AuthConfig> => {
    const googleConfigured = Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET);
    return {
      publicRegistration: await getBooleanSetting(db, PUBLIC_REGISTRATION, false),
      googleLogin: googleConfigured && (await isFeatureEnabledGlobally(db, 'google_login')),
    };
  });

  app.post('/api/auth/register', { config: mailLimited }, async (request, reply) => {
    const body = parseBody(registerSchema, request.body);

    let inviteId: string | null = null;
    if (body.inviteToken) {
      const [invite] = await db
        .select()
        .from(invites)
        .where(eq(invites.tokenHash, hashToken(body.inviteToken)));
      if (
        !invite ||
        invite.usedAt ||
        invite.expiresAt.getTime() < Date.now() ||
        (invite.email && invite.email !== body.email)
      ) {
        throw new AppError(400, 'invalid_invite', 'The invitation is invalid or has expired');
      }
      inviteId = invite.id;
    } else if (!(await getBooleanSetting(db, PUBLIC_REGISTRATION, false))) {
      throw new AppError(403, 'registration_closed', 'Registration requires an invitation');
    }

    // Hashed before the lookup so a taken address costs the same time as a free one.
    const passwordHash = await hashPassword(body.password);
    const existing = await findUserByEmail(db, body.email);
    if (existing) {
      await authMail.sendReset(existing, 'accountExists');
      return reply.status(202).send({ status: 'verification_sent' });
    }

    const user = {
      id: newId(),
      email: body.email,
      name: body.name,
      locale: body.locale,
      passwordHash,
      avatar: randomPresetAvatar(),
      privacyConsentAt: new Date(),
    };
    await db.transaction(async (tx) => {
      await tx.insert(users).values(user);
      if (inviteId) {
        const [result] = await tx
          .update(invites)
          .set({ usedAt: new Date(), usedBy: user.id })
          .where(and(eq(invites.id, inviteId), isNull(invites.usedAt)));
        if (result.affectedRows !== 1) {
          throw new AppError(400, 'invalid_invite', 'The invitation is invalid or has expired');
        }
      }
    });
    await authMail.sendVerification(user);
    return reply.status(202).send({ status: 'verification_sent' });
  });

  app.post('/api/auth/resend-verification', { config: mailLimited }, async (request, reply) => {
    const { email } = parseBody(z.object({ email: emailSchema }), request.body);
    const user = await findUserByEmail(db, email);
    if (user && user.active && !user.emailVerifiedAt) await authMail.sendVerification(user);
    return reply.status(202).send({ status: 'ok' });
  });

  app.post('/api/auth/verify-email', { config: strict }, async (request) => {
    const { token } = parseBody(tokenBodySchema, request.body);
    const row = await consumeAuthToken(db, token, 'verify_email');
    await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, row.userId));
    return { status: 'verified' };
  });

  app.post('/api/auth/login', { config: strict }, async (request, reply) => {
    const body = parseBody(loginSchema, request.body);
    if (await isLoginLocked(db, body.email)) {
      throw new AppError(429, 'too_many_attempts', 'Too many failed attempts, try again later');
    }
    const user = await findUserByEmail(db, body.email);
    const valid = await verifyPassword(user?.passwordHash ?? null, body.password);
    if (!user || !valid) {
      await recordLoginFailure(db, body.email);
      throw new AppError(401, 'invalid_credentials', 'Invalid email or password');
    }
    await clearLoginFailures(db, body.email);
    if (!user.active) throw new AppError(403, 'account_disabled', 'This account is disabled');
    if (!user.emailVerifiedAt) {
      throw new AppError(403, 'email_not_verified', 'Please verify your email address first');
    }
    const token = await createSession(db, user.id);
    setSessionCookie(reply, config, token);
    return { user: await toPublicUser(db, user) };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) await deleteSession(db, token);
    clearSessionCookie(reply, config);
    return reply.status(204).send();
  });

  app.post('/api/auth/forgot-password', { config: mailLimited }, async (request, reply) => {
    const { email } = parseBody(forgotPasswordSchema, request.body);
    const user = await findUserByEmail(db, email);
    if (user && user.active) await authMail.sendReset(user);
    return reply.status(202).send({ status: 'ok' });
  });

  app.post('/api/auth/reset-password', { config: strict }, async (request) => {
    const body = parseBody(resetPasswordSchema, request.body);
    const row = await consumeAuthToken(db, body.token, 'reset_password');
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(body.password), emailVerifiedAt: new Date() })
      .where(eq(users.id, row.userId));
    await deleteUserSessions(db, row.userId);
    return { status: 'password_reset' };
  });
}
