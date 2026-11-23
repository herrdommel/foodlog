import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  passkeyRegisterSchema,
  passkeyRenameSchema,
  reauthSchema,
  totpConfirmSchema,
  type PasskeyAddedDto,
  type RecoveryCodesDto,
  type TotpSetupDto,
} from '@foodlog/shared';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import type { AppDeps } from '../app.ts';
import { passkeys } from '../db/schema.ts';
import { clearShortLivedCookie, setShortLivedCookie, WEBAUTHN_COOKIE } from '../lib/cookies.ts';
import { AppError, parseBody } from '../lib/errors.ts';
import { createMfaService } from '../services/mfa.ts';
import { deleteUserSessions } from '../services/sessions.ts';

const limited = { rateLimit: { max: 10, timeWindow: '1 minute' } };
const idSchema = z.object({ id: z.uuid() });

export async function mfaRoutes(app: FastifyInstance, { config, db }: AppDeps) {
  const mfa = createMfaService({ config, db });
  const auth = { preHandler: app.requireUser, config: limited };

  const endOtherSessions = (userId: string, sessionId: string | null) =>
    deleteUserSessions(db, userId, sessionId ?? undefined);

  app.post('/api/me/mfa/totp/setup', auth, async (request): Promise<TotpSetupDto> => {
    return mfa.startTotpSetup(request.user!);
  });

  app.post('/api/me/mfa/totp/confirm', auth, async (request): Promise<RecoveryCodesDto | null> => {
    const user = request.user!;
    const body = parseBody(totpConfirmSchema, request.body);
    await mfa.assertReauth(user, request.sessionId, body.password);
    const firstFactor = !(await mfa.hasMfa(user.id));
    if (!(await mfa.checkTotp(user.id, body.code, true))) {
      throw new AppError(400, 'invalid_code', 'The code is not correct');
    }
    await mfa.activateTotp(user.id);
    await endOtherSessions(user.id, request.sessionId);
    return { recoveryCodes: firstFactor ? await mfa.issueRecoveryCodes(user.id) : [] };
  });

  app.post('/api/me/mfa/totp/disable', auth, async (request, reply) => {
    const user = request.user!;
    const body = parseBody(reauthSchema, request.body ?? {});
    await mfa.assertReauth(user, request.sessionId, body.password);
    const keys = await mfa.listPasskeys(user.id);
    await mfa.assertCanRemoveFactor(user, keys.length);
    await mfa.removeTotp(user.id);
    await endOtherSessions(user.id, request.sessionId);
    return reply.status(204).send();
  });

  app.post('/api/me/mfa/passkeys/options', auth, async (request, reply) => {
    const user = request.user!;
    const body = parseBody(reauthSchema, request.body ?? {});
    await mfa.assertReauth(user, request.sessionId, body.password);
    const { options, token } = await mfa.registrationOptions(user);
    setShortLivedCookie(reply, config, WEBAUTHN_COOKIE, token);
    return { options };
  });

  app.post('/api/me/mfa/passkeys', auth, async (request, reply): Promise<PasskeyAddedDto> => {
    const user = request.user!;
    const body = parseBody(passkeyRegisterSchema, request.body);
    const firstFactor = !(await mfa.hasMfa(user.id));
    const passkey = await mfa.addPasskey(
      user,
      request.cookies[WEBAUTHN_COOKIE],
      body.name,
      body.response as unknown as RegistrationResponseJSON,
    );
    clearShortLivedCookie(reply, config, WEBAUTHN_COOKIE);
    await endOtherSessions(user.id, request.sessionId);
    return { passkey, recoveryCodes: firstFactor ? await mfa.issueRecoveryCodes(user.id) : null };
  });

  app.patch('/api/me/mfa/passkeys/:id', auth, async (request, reply) => {
    const { id } = parseBody(idSchema, request.params);
    const { name } = parseBody(passkeyRenameSchema, request.body);
    const [row] = await db.select().from(passkeys).where(eq(passkeys.id, id));
    if (!row || row.userId !== request.user!.id) {
      throw new AppError(404, 'not_found', 'Passkey not found');
    }
    await db.update(passkeys).set({ name }).where(eq(passkeys.id, id));
    return reply.status(204).send();
  });

  app.post('/api/me/mfa/passkeys/:id/delete', auth, async (request, reply) => {
    const user = request.user!;
    const { id } = parseBody(idSchema, request.params);
    const body = parseBody(reauthSchema, request.body ?? {});
    await mfa.assertReauth(user, request.sessionId, body.password);
    const total = await mfa.factorCount(user.id);
    await mfa.assertCanRemoveFactor(user, total - 1);
    if (!(await mfa.removePasskey(user.id, id))) {
      throw new AppError(404, 'not_found', 'Passkey not found');
    }
    await endOtherSessions(user.id, request.sessionId);
    return reply.status(204).send();
  });

  app.post('/api/me/mfa/recovery-codes', auth, async (request): Promise<RecoveryCodesDto> => {
    const user = request.user!;
    const body = parseBody(reauthSchema, request.body ?? {});
    await mfa.assertReauth(user, request.sessionId, body.password);
    if (!(await mfa.hasMfa(user.id))) {
      throw new AppError(409, 'mfa_not_enabled', 'Set up a second factor first');
    }
    return { recoveryCodes: await mfa.issueRecoveryCodes(user.id) };
  });
}
