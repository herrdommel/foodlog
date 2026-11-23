import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';

const b64u = (buffer: Buffer) => buffer.toString('base64url');
const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest();

function header(major: number, length: number): Buffer {
  if (length < 24) return Buffer.from([(major << 5) | length]);
  return Buffer.from([(major << 5) | 24, length]);
}
const cborBytes = (data: Buffer) => Buffer.concat([header(2, data.length), data]);
const cborText = (text: string) => Buffer.concat([header(3, text.length), Buffer.from(text)]);
const cborInt = (value: number) =>
  value >= 0 ? header(0, value) : Buffer.concat([header(1, -1 - value)]);

// A minimal in-memory authenticator (ES256, "none" attestation, user verification on).
export function createSoftwareAuthenticator(rpId: string, origin: string) {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' }) as {
    publicKey: KeyObject;
    privateKey: KeyObject;
  };
  const credentialId = randomBytes(32);
  let counter = 0;
  const rpIdHash = sha256(rpId);

  const clientData = (type: string, challenge: string) =>
    Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));

  return {
    id: b64u(credentialId),
    register(challenge: string) {
      const jwk = publicKey.export({ format: 'jwk' });
      const cose = Buffer.concat([
        Buffer.from([0xa5]),
        cborInt(1),
        cborInt(2),
        cborInt(3),
        cborInt(-7),
        cborInt(-1),
        cborInt(1),
        cborInt(-2),
        cborBytes(Buffer.from(jwk.x!, 'base64url')),
        cborInt(-3),
        cborBytes(Buffer.from(jwk.y!, 'base64url')),
      ]);
      const credentialIdLength = Buffer.alloc(2);
      credentialIdLength.writeUInt16BE(credentialId.length);
      const authData = Buffer.concat([
        rpIdHash,
        Buffer.from([0x45]),
        Buffer.alloc(4),
        Buffer.alloc(16),
        credentialIdLength,
        credentialId,
        cose,
      ]);
      const attestationObject = Buffer.concat([
        Buffer.from([0xa3]),
        cborText('fmt'),
        cborText('none'),
        cborText('attStmt'),
        Buffer.from([0xa0]),
        cborText('authData'),
        cborBytes(authData),
      ]);
      return {
        id: b64u(credentialId),
        rawId: b64u(credentialId),
        type: 'public-key',
        response: {
          clientDataJSON: b64u(clientData('webauthn.create', challenge)),
          attestationObject: b64u(attestationObject),
          transports: ['internal'],
        },
        clientExtensionResults: {},
      };
    },
    assert(challenge: string, userHandle?: string) {
      counter += 1;
      const counterBytes = Buffer.alloc(4);
      counterBytes.writeUInt32BE(counter);
      const authData = Buffer.concat([rpIdHash, Buffer.from([0x05]), counterBytes]);
      const data = clientData('webauthn.get', challenge);
      const signature = sign('sha256', Buffer.concat([authData, sha256(data)]), privateKey);
      return {
        id: b64u(credentialId),
        rawId: b64u(credentialId),
        type: 'public-key',
        response: {
          clientDataJSON: b64u(data),
          authenticatorData: b64u(authData),
          signature: b64u(signature),
          ...(userHandle ? { userHandle: b64u(Buffer.from(userHandle)) } : {}),
        },
        clientExtensionResults: {},
      };
    },
  };
}
