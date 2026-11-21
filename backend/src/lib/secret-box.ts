import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const VERSION = 'v1';

function keyId(key: Buffer): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 8);
}

export interface SecretBox {
  encrypt(plaintext: string, context: string): string;
  decrypt(value: string, context: string): string;
}

export function createSecretBox(keys: { active: Buffer; previous?: Buffer[] }): SecretBox {
  const all = [keys.active, ...(keys.previous ?? [])];
  for (const key of all) {
    if (key.length !== 32) throw new Error('encryption keys must be 32 bytes');
  }
  const byId = new Map(all.map((key) => [keyId(key), key]));
  const activeId = keyId(keys.active);

  return {
    encrypt(plaintext, context) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', keys.active, iv);
      cipher.setAAD(Buffer.from(context));
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      return [
        VERSION,
        activeId,
        iv.toString('base64url'),
        cipher.getAuthTag().toString('base64url'),
        ciphertext.toString('base64url'),
      ].join('.');
    },

    decrypt(value, context) {
      const [version, id, iv, tag, ciphertext] = value.split('.');
      const key = id ? byId.get(id) : undefined;
      if (version !== VERSION || !key || !iv || !tag || !ciphertext) {
        throw new Error('invalid or unreadable secret');
      }
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
      decipher.setAAD(Buffer.from(context));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    },
  };
}
