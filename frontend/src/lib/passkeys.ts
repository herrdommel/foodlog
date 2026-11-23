import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/browser';
import { ApiError } from '../api/client.ts';

export const passkeysSupported = () => browserSupportsWebAuthn();

async function run<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    const cancelled =
      error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'AbortError');
    throw new ApiError(0, cancelled ? 'passkey_cancelled' : 'passkey_failed', 'Passkey failed');
  }
}

export function createPasskey(
  optionsJSON: PublicKeyCredentialCreationOptionsJSON,
): Promise<RegistrationResponseJSON> {
  return run(() => startRegistration({ optionsJSON }));
}

export function assertPasskey(
  optionsJSON: PublicKeyCredentialRequestOptionsJSON,
): Promise<AuthenticationResponseJSON> {
  return run(() => startAuthentication({ optionsJSON }));
}
