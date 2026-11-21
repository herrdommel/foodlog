import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSecretBox } from '../src/lib/secret-box.ts';

const key = () => randomBytes(32);

describe('secret box', () => {
  it('round-trips and never repeats a ciphertext', () => {
    const box = createSecretBox({ active: key() });
    const first = box.encrypt('sk-test-123', 'user:anthropic');
    const second = box.encrypt('sk-test-123', 'user:anthropic');
    expect(first).not.toBe(second);
    expect(first).not.toContain('sk-test-123');
    expect(first.startsWith('v1.')).toBe(true);
    expect(box.decrypt(first, 'user:anthropic')).toBe('sk-test-123');
    expect(box.decrypt(second, 'user:anthropic')).toBe('sk-test-123');
  });

  it('handles unicode and long values', () => {
    const box = createSecretBox({ active: key() });
    const value = 'schlüssel-ü-🔑-'.repeat(50);
    expect(box.decrypt(box.encrypt(value, 'c'), 'c')).toBe(value);
  });

  it('detects tampering in every segment', () => {
    const box = createSecretBox({ active: key() });
    const parts = box.encrypt('secret', 'c').split('.');
    for (let index = 2; index < parts.length; index++) {
      const changed = [...parts];
      const original = changed[index]!;
      changed[index] = `${original.slice(0, -1)}${original.endsWith('A') ? 'B' : 'A'}`;
      expect(() => box.decrypt(changed.join('.'), 'c'), `segment ${index}`).toThrow();
    }
  });

  it('is bound to its context so a value cannot be moved to another user or provider', () => {
    const box = createSecretBox({ active: key() });
    const value = box.encrypt('secret', 'user-a:anthropic');
    expect(() => box.decrypt(value, 'user-b:anthropic')).toThrow();
    expect(() => box.decrypt(value, 'user-a:openai')).toThrow();
    expect(box.decrypt(value, 'user-a:anthropic')).toBe('secret');
  });

  it('rejects a different key', () => {
    const value = createSecretBox({ active: key() }).encrypt('secret', 'c');
    expect(() => createSecretBox({ active: key() }).decrypt(value, 'c')).toThrow();
  });

  it('supports key rotation through previous keys', () => {
    const oldKey = key();
    const newKey = key();
    const stored = createSecretBox({ active: oldKey }).encrypt('secret', 'c');

    const rotated = createSecretBox({ active: newKey, previous: [oldKey] });
    expect(rotated.decrypt(stored, 'c')).toBe('secret');
    const fresh = rotated.encrypt('secret', 'c');
    expect(fresh.split('.')[1]).not.toBe(stored.split('.')[1]);
    expect(createSecretBox({ active: newKey }).decrypt(fresh, 'c')).toBe('secret');
    expect(() => createSecretBox({ active: newKey }).decrypt(stored, 'c')).toThrow();
  });

  it('rejects malformed values and bad keys', () => {
    const box = createSecretBox({ active: key() });
    for (const value of ['', 'garbage', 'v2.a.b.c.d', 'v1.unknown.a.b.c']) {
      expect(() => box.decrypt(value, 'c')).toThrow();
    }
    expect(() => createSecretBox({ active: randomBytes(16) })).toThrow();
  });
});
