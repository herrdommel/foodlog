import { z } from 'zod';
import type { PublicUser } from './auth.ts';

export const MFA_METHODS = ['totp', 'passkey', 'recovery'] as const;
export type MfaMethod = (typeof MFA_METHODS)[number];

export const totpCodeSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, ''))
  .pipe(z.string().regex(/^\d{6}$/));

export const recoveryCodeSchema = z
  .string()
  .transform((value) => value.replace(/[\s-]+/g, '').toLowerCase())
  .pipe(z.string().regex(/^[a-z0-9]{12}$/));

export const reauthSchema = z.object({ password: z.string().min(1).max(128).optional() });

export const totpConfirmSchema = reauthSchema.extend({ code: totpCodeSchema });

export const passkeyNameSchema = z.string().trim().min(1).max(60);

export const passkeyRenameSchema = z.object({ name: passkeyNameSchema });

// The browser's JSON form of a WebAuthn credential, validated again by the library.
export const webauthnResponseSchema = z.object({ id: z.string().min(1).max(1400) }).loose();

export const passkeyRegisterSchema = z.object({
  name: passkeyNameSchema,
  response: webauthnResponseSchema,
});

export const passkeyLoginSchema = z.object({ response: webauthnResponseSchema });

export const mfaLoginTotpSchema = z.object({ code: totpCodeSchema });
export const mfaLoginRecoverySchema = z.object({ code: recoveryCodeSchema });

export interface PasskeyDto {
  id: string;
  name: string;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface MfaStatus {
  enabled: boolean;
  totp: boolean;
  passkeys: PasskeyDto[];
  recoveryCodesLeft: number;
  required: boolean;
}

export interface MfaRequiredResponse {
  mfaRequired: true;
  methods: MfaMethod[];
}

export type LoginResponse = { user: PublicUser } | MfaRequiredResponse;

export interface TotpSetupDto {
  secret: string;
  otpauthUrl: string;
}

export interface RecoveryCodesDto {
  recoveryCodes: string[];
}

export interface PasskeyAddedDto {
  passkey: PasskeyDto;
  recoveryCodes: string[] | null;
}
