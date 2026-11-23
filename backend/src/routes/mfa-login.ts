import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  mfaLoginRecoverySchema,
  mfaLoginTotpSchema,
  passkeyLoginSchema,
  type LoginResponse,
} from '@foodlog/shared';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import type { AppDeps } from '../app.ts';
import {
  clearShortLivedCookie,
  MFA_COOKIE,
  setSessionCookie,
  setShortLivedCookie,
  WEBAUTHN_COOKIE,
} from '../lib/cookies.ts';
import { AppError, parseBody } from '../lib/errors.ts';
import { createMfaService } from '../services/mfa.ts';
import {
  clearLoginFailures,
  isLoginLocked,
  recordLoginFailure,
} from '../services/login-throttle.ts';
import { createSession } from '../services/sessions.ts';
import { toPublicUser, type UserRow } from '../services/users.ts';

const strict = { rateLimit: { max: 10, timeWindow: '1 minute' } };

export async function mfaLoginRoutes(app: FastifyInstance, { config, db }: AppDeps) {
  const mfa = createMfaService({ config, db });

  function assertAccountUsable(user: UserRow | undefined): asserts user is UserRow {
    if (!user) throw new AppError(401, 'invalid_credentials', 'Sign-in failed');
    if (!user.active) throw new AppError(403, 'account_disabled', 'This account is disabled');
    if (!user.emailVerifiedAt) {
      throw new AppError(403, 'email_not_verified', 'Please verify your email address first');
    }
  }

  async function complete(reply: FastifyReply, user: UserRow): Promise<LoginResponse> {
    clearShortLivedCookie(reply, config, MFA_COOKIE);
    clearShortLivedCookie(reply, config, WEBAUTHN_COOKIE);
    setSessionCookie(reply, config, await createSession(db, user.id));
    return { user: await toPublicUser(db, user) };
  }

  async function pendingLogin(request: FastifyRequest) {
    const pending = await mfa.findPending(request.cookies[MFA_COOKIE]);
    if (!pending) {
      throw new AppError(401, 'mfa_expired', 'The sign-in expired, please start again');
    }
    const user = await mfa.findUser(pending.userId);
    assertAccountUsable(user);
    if (await isLoginLocked(db, user.email)) {
      throw new AppError(429, 'too_many_attempts', 'Too many failed attempts, try again later');
    }
    return { pending, user };
  }

  // Wrong codes count against the same per-address lock as wrong passwords.
  async function rejectCode(pendingId: string, email: string): Promise<never> {
    await recordLoginFailure(db, email);
    await mfa.countPendingFailure(pendingId);
    throw new AppError(401, 'invalid_code', 'The code is not correct');
  }

  async function accept(reply: FastifyReply, pendingId: string, user: UserRow) {
    await mfa.deletePending(pendingId);
    await clearLoginFailures(db, user.email);
    return complete(reply, user);
  }

  app.post('/api/auth/mfa/totp', { config: strict }, async (request, reply) => {
    const { code } = parseBody(mfaLoginTotpSchema, request.body);
    const { pending, user } = await pendingLogin(request);
    if (!(await mfa.checkTotp(user.id, code))) return rejectCode(pending.id, user.email);
    return accept(reply, pending.id, user);
  });

  app.post('/api/auth/mfa/recovery', { config: strict }, async (request, reply) => {
    const { code } = parseBody(mfaLoginRecoverySchema, request.body);
    const { pending, user } = await pendingLogin(request);
    if (!(await mfa.consumeRecoveryCode(user.id, code))) return rejectCode(pending.id, user.email);
    return accept(reply, pending.id, user);
  });

  app.post('/api/auth/mfa/passkey/options', { config: strict }, async (request, reply) => {
    const { user } = await pendingLogin(request);
    const { options, token } = await mfa.authenticationOptions(user.id);
    setShortLivedCookie(reply, config, WEBAUTHN_COOKIE, token);
    return { options };
  });

  app.post('/api/auth/mfa/passkey/verify', { config: strict }, async (request, reply) => {
    const { response } = parseBody(passkeyLoginSchema, request.body);
    const { pending, user } = await pendingLogin(request);
    const challenge = await mfa.takeChallenge(request.cookies[WEBAUTHN_COOKIE], 'login_mfa');
    if (!challenge || challenge.userId !== user.id) {
      throw new AppError(400, 'invalid_challenge', 'The request expired, please try again');
    }
    const owner = await mfa.checkPasskey(
      response as unknown as AuthenticationResponseJSON,
      challenge.challenge,
      user.id,
    );
    if (!owner) return rejectCode(pending.id, user.email);
    return accept(reply, pending.id, user);
  });

  app.post('/api/auth/passkey/options', { config: strict }, async (_request, reply) => {
    const { options, token } = await mfa.authenticationOptions(null);
    setShortLivedCookie(reply, config, WEBAUTHN_COOKIE, token);
    return { options };
  });

  // A passkey that required user verification is already two factors, so no second step follows.
  app.post('/api/auth/passkey/verify', { config: strict }, async (request, reply) => {
    const { response } = parseBody(passkeyLoginSchema, request.body);
    const challenge = await mfa.takeChallenge(request.cookies[WEBAUTHN_COOKIE], 'login');
    if (!challenge) {
      throw new AppError(400, 'invalid_challenge', 'The request expired, please try again');
    }
    const owner = await mfa.checkPasskey(
      response as unknown as AuthenticationResponseJSON,
      challenge.challenge,
    );
    if (!owner) throw new AppError(401, 'invalid_credentials', 'Sign-in failed');
    const user = await mfa.findUser(owner);
    assertAccountUsable(user);
    return complete(reply, user);
  });
}
