import { randomBytes } from 'node:crypto';
import { and, count, eq, gt, isNull, lt } from 'drizzle-orm';
import { generateSecret, generateURI, verifySync } from 'otplib';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import type { MfaMethod, MfaStatus, PasskeyDto } from '@foodlog/shared';
import { encryptionKeys, type Config } from '../config.ts';
import type { Database } from '../db/client.ts';
import {
  loginChallenges,
  mfaRecoveryCodes,
  mfaTotp,
  passkeys,
  sessions,
  users,
  webauthnChallenges,
} from '../db/schema.ts';
import { hashToken, newId, newToken } from '../lib/crypto.ts';
import { AppError } from '../lib/errors.ts';
import { verifyPassword } from '../lib/password.ts';
import { createSecretBox } from '../lib/secret-box.ts';
import { MINUTE, inFuture } from '../lib/time.ts';
import type { UserRow } from './users.ts';

export const MFA_PENDING_TTL = 5 * MINUTE;
export const MFA_MAX_ATTEMPTS = 5;
const CHALLENGE_TTL = 5 * MINUTE;
const FRESH_SESSION = 10 * MINUTE;
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const ISSUER = 'Foodlog I/O';

export type ChallengePurpose = 'register' | 'login_mfa' | 'login';

function recoveryCode(): string {
  const bytes = randomBytes(12);
  const chars = Array.from(bytes, (byte) => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length]);
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8, 12)]
    .map((part) => part.join(''))
    .join('-');
}

function toPasskeyDto(row: typeof passkeys.$inferSelect): PasskeyDto {
  return {
    id: row.id,
    name: row.name,
    backedUp: row.backedUp,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  };
}

function affected(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  return (header as { affectedRows?: number } | undefined)?.affectedRows ?? 0;
}

export function createMfaService({ config, db }: { config: Config; db: Database }) {
  const box = createSecretBox(encryptionKeys(config));
  const origin = new URL(config.APP_URL).origin;
  const rpID = new URL(config.APP_URL).hostname;

  async function confirmedTotp(userId: string) {
    const [row] = await db.select().from(mfaTotp).where(eq(mfaTotp.userId, userId));
    return row?.confirmedAt ? row : null;
  }

  async function listPasskeys(userId: string) {
    return db.select().from(passkeys).where(eq(passkeys.userId, userId));
  }

  async function recoveryCodesLeft(userId: string): Promise<number> {
    const [row] = await db
      .select({ total: count() })
      .from(mfaRecoveryCodes)
      .where(and(eq(mfaRecoveryCodes.userId, userId), isNull(mfaRecoveryCodes.usedAt)));
    return row?.total ?? 0;
  }

  async function methodsFor(userId: string): Promise<MfaMethod[]> {
    const methods: MfaMethod[] = [];
    if (await confirmedTotp(userId)) methods.push('totp');
    if ((await listPasskeys(userId)).length > 0) methods.push('passkey');
    if (methods.length > 0 && (await recoveryCodesLeft(userId)) > 0) methods.push('recovery');
    return methods;
  }

  async function hasMfa(userId: string): Promise<boolean> {
    return (await confirmedTotp(userId)) !== null || (await listPasskeys(userId)).length > 0;
  }

  async function status(user: UserRow): Promise<MfaStatus> {
    const keys = await listPasskeys(user.id);
    const totp = (await confirmedTotp(user.id)) !== null;
    return {
      enabled: totp || keys.length > 0,
      totp,
      passkeys: keys.map(toPasskeyDto),
      recoveryCodesLeft: await recoveryCodesLeft(user.id),
      required: user.role === 'admin',
    };
  }

  async function assertReauth(user: UserRow, sessionId: string | null, password?: string) {
    if (user.passwordHash) {
      if (!password || !(await verifyPassword(user.passwordHash, password))) {
        throw new AppError(403, 'invalid_password', 'The password is incorrect');
      }
      return;
    }
    // Without a password the only proof of presence is a recently started session.
    const [session] = sessionId
      ? await db.select().from(sessions).where(eq(sessions.id, sessionId))
      : [];
    if (!session || Date.now() - session.createdAt.getTime() > FRESH_SESSION) {
      throw new AppError(403, 'reauth_required', 'Please sign in again to change this');
    }
  }

  async function assertCanRemoveFactor(user: UserRow, remainingFactors: number) {
    if (user.role === 'admin' && remainingFactors === 0) {
      throw new AppError(409, 'mfa_required', 'Administrators need a second factor');
    }
  }

  async function dropRecoveryCodesIfUnused(userId: string) {
    if (!(await hasMfa(userId))) {
      await db.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
    }
  }

  async function issueRecoveryCodes(userId: string): Promise<string[]> {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, recoveryCode);
    await db.transaction(async (tx) => {
      await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
      await tx.insert(mfaRecoveryCodes).values(
        codes.map((code) => ({
          id: newId(),
          userId,
          codeHash: hashToken(code.replaceAll('-', '')),
        })),
      );
    });
    return codes;
  }

  async function consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
    const result = await db
      .update(mfaRecoveryCodes)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(mfaRecoveryCodes.userId, userId),
          eq(mfaRecoveryCodes.codeHash, hashToken(code)),
          isNull(mfaRecoveryCodes.usedAt),
        ),
      );
    return affected(result) === 1;
  }

  async function startTotpSetup(user: UserRow) {
    if (await confirmedTotp(user.id)) {
      throw new AppError(409, 'totp_already_enabled', 'An authenticator app is already set up');
    }
    const secret = generateSecret();
    const encrypted = box.encrypt(secret, `${user.id}:totp`);
    await db
      .insert(mfaTotp)
      .values({ userId: user.id, secret: encrypted })
      .onDuplicateKeyUpdate({ set: { secret: encrypted, confirmedAt: null, lastTimeStep: 0 } });
    return {
      secret,
      otpauthUrl: generateURI({ issuer: ISSUER, label: user.email, secret }),
    };
  }

  // Returns false for a wrong or replayed code. A code is accepted once per time step.
  async function checkTotp(userId: string, code: string, pending = false): Promise<boolean> {
    const [row] = await db.select().from(mfaTotp).where(eq(mfaTotp.userId, userId));
    if (!row || Boolean(row.confirmedAt) === pending) return false;
    const secret = box.decrypt(row.secret, `${userId}:totp`);
    const result = verifySync({
      secret,
      token: code,
      epochTolerance: 30,
      afterTimeStep: row.lastTimeStep,
    });
    if (!result.valid || !('timeStep' in result)) return false;
    const update = await db
      .update(mfaTotp)
      .set({ lastTimeStep: result.timeStep })
      .where(and(eq(mfaTotp.userId, userId), lt(mfaTotp.lastTimeStep, result.timeStep)));
    return affected(update) === 1;
  }

  async function activateTotp(userId: string) {
    await db.update(mfaTotp).set({ confirmedAt: new Date() }).where(eq(mfaTotp.userId, userId));
  }

  async function removeTotp(userId: string) {
    await db.delete(mfaTotp).where(eq(mfaTotp.userId, userId));
    await dropRecoveryCodesIfUnused(userId);
  }

  async function createPending(userId: string): Promise<string> {
    const token = newToken();
    await db.insert(loginChallenges).values({
      id: hashToken(token),
      userId,
      expiresAt: inFuture(MFA_PENDING_TTL),
    });
    return token;
  }

  async function findPending(token: string | undefined) {
    if (!token) return null;
    const [row] = await db
      .select()
      .from(loginChallenges)
      .where(
        and(eq(loginChallenges.id, hashToken(token)), gt(loginChallenges.expiresAt, new Date())),
      );
    return row ?? null;
  }

  async function countPendingFailure(pendingId: string) {
    const [row] = await db.select().from(loginChallenges).where(eq(loginChallenges.id, pendingId));
    if (!row) return;
    if (row.attempts + 1 >= MFA_MAX_ATTEMPTS) {
      await db.delete(loginChallenges).where(eq(loginChallenges.id, pendingId));
    } else {
      await db
        .update(loginChallenges)
        .set({ attempts: row.attempts + 1 })
        .where(eq(loginChallenges.id, pendingId));
    }
  }

  async function deletePending(pendingId: string) {
    await db.delete(loginChallenges).where(eq(loginChallenges.id, pendingId));
  }

  async function storeChallenge(
    purpose: ChallengePurpose,
    userId: string | null,
    challenge: string,
  ): Promise<string> {
    const token = newToken();
    await db.insert(webauthnChallenges).values({
      id: hashToken(token),
      userId,
      purpose,
      challenge,
      expiresAt: inFuture(CHALLENGE_TTL),
    });
    return token;
  }

  async function takeChallenge(token: string | undefined, purpose: ChallengePurpose) {
    if (!token) return null;
    const id = hashToken(token);
    const [row] = await db.select().from(webauthnChallenges).where(eq(webauthnChallenges.id, id));
    if (!row) return null;
    const removed = await db.delete(webauthnChallenges).where(eq(webauthnChallenges.id, id));
    if (affected(removed) !== 1) return null;
    if (row.purpose !== purpose || row.expiresAt.getTime() < Date.now()) return null;
    return row;
  }

  async function registrationOptions(user: UserRow) {
    const existing = await listPasskeys(user.id);
    const options = await generateRegistrationOptions({
      rpName: ISSUER,
      rpID,
      userName: user.email,
      userDisplayName: user.name,
      userID: new TextEncoder().encode(user.id),
      attestationType: 'none',
      excludeCredentials: existing.map((key) => ({
        id: key.credentialId,
        transports: key.transports?.split(','),
      })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });
    const token = await storeChallenge('register', user.id, options.challenge);
    return { options, token };
  }

  async function addPasskey(
    user: UserRow,
    token: string | undefined,
    name: string,
    response: RegistrationResponseJSON,
  ): Promise<PasskeyDto> {
    const challenge = await takeChallenge(token, 'register');
    if (!challenge || challenge.userId !== user.id) {
      throw new AppError(400, 'invalid_challenge', 'The request expired, please try again');
    }
    let info;
    try {
      const verified = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
      });
      if (!verified.verified) throw new Error('not verified');
      info = verified.registrationInfo;
    } catch {
      throw new AppError(400, 'passkey_rejected', 'The passkey could not be verified');
    }
    const row = {
      id: newId(),
      userId: user.id,
      credentialId: info.credential.id,
      publicKey: Buffer.from(info.credential.publicKey),
      counter: info.credential.counter,
      transports: info.credential.transports?.join(',') ?? null,
      backedUp: info.credentialBackedUp,
      name,
    };
    try {
      await db.insert(passkeys).values(row);
    } catch {
      throw new AppError(409, 'passkey_exists', 'This passkey is already registered');
    }
    const [saved] = await db.select().from(passkeys).where(eq(passkeys.id, row.id));
    return toPasskeyDto(saved!);
  }

  async function authenticationOptions(userId: string | null) {
    const keys = userId ? await listPasskeys(userId) : [];
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'required',
      allowCredentials: userId
        ? keys.map((key) => ({ id: key.credentialId, transports: key.transports?.split(',') }))
        : undefined,
    });
    const token = await storeChallenge(userId ? 'login_mfa' : 'login', userId, options.challenge);
    return { options, token };
  }

  // Returns the owner of the passkey, or null if the assertion does not verify.
  async function checkPasskey(
    response: AuthenticationResponseJSON,
    challenge: string,
    expectedUserId?: string,
  ): Promise<string | null> {
    const [key] = await db.select().from(passkeys).where(eq(passkeys.credentialId, response.id));
    if (!key || (expectedUserId && key.userId !== expectedUserId)) return null;
    try {
      const verified = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
        credential: {
          id: key.credentialId,
          publicKey: new Uint8Array(key.publicKey),
          counter: key.counter,
          transports: key.transports?.split(','),
        },
      });
      if (!verified.verified) return null;
      await db
        .update(passkeys)
        .set({ counter: verified.authenticationInfo.newCounter, lastUsedAt: new Date() })
        .where(eq(passkeys.id, key.id));
      return key.userId;
    } catch {
      return null;
    }
  }

  async function findUser(userId: string) {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    return user;
  }

  async function removePasskey(userId: string, id: string): Promise<boolean> {
    const result = await db
      .delete(passkeys)
      .where(and(eq(passkeys.id, id), eq(passkeys.userId, userId)));
    if (affected(result) !== 1) return false;
    await dropRecoveryCodesIfUnused(userId);
    return true;
  }

  async function clearAll(userId: string) {
    await db.delete(mfaTotp).where(eq(mfaTotp.userId, userId));
    await db.delete(passkeys).where(eq(passkeys.userId, userId));
    await db.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
    await db.delete(loginChallenges).where(eq(loginChallenges.userId, userId));
  }

  async function factorCount(userId: string): Promise<number> {
    return ((await confirmedTotp(userId)) ? 1 : 0) + (await listPasskeys(userId)).length;
  }

  return {
    status,
    hasMfa,
    methodsFor,
    assertReauth,
    assertCanRemoveFactor,
    factorCount,
    issueRecoveryCodes,
    consumeRecoveryCode,
    startTotpSetup,
    checkTotp,
    activateTotp,
    removeTotp,
    createPending,
    findPending,
    countPendingFailure,
    deletePending,
    registrationOptions,
    addPasskey,
    authenticationOptions,
    takeChallenge,
    checkPasskey,
    findUser,
    removePasskey,
    clearAll,
    listPasskeys,
  };
}

export type MfaService = ReturnType<typeof createMfaService>;
