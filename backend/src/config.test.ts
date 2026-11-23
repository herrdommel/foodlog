import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { encryptionKeys, loadConfig } from './config.ts';

const base = {
  NODE_ENV: 'development',
  APP_URL: 'http://localhost:5173',
  DATABASE_URL: 'mysql://u:p@127.0.0.1:3306/db',
  API_KEY_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '1025',
  SMTP_FROM: 'Foodlog <foodlog@example.com>',
};

describe('loadConfig', () => {
  it('fails fast on missing values', () => {
    expect(() => loadConfig({})).toThrow(/Invalid environment configuration/);
  });

  it('keeps the AI mock provider off unless requested', () => {
    expect(loadConfig(base).AI_MOCK_PROVIDER).toBe(false);
    expect(loadConfig({ ...base, AI_MOCK_PROVIDER: 'true' }).AI_MOCK_PROVIDER).toBe(true);
  });

  it('refuses the AI mock provider in production', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', AI_MOCK_PROVIDER: 'true' })).toThrow(
      /AI_MOCK_PROVIDER/,
    );
    expect(() => loadConfig({ ...base, NODE_ENV: 'production' })).not.toThrow();
  });

  it('rejects an encryption key of the wrong size', () => {
    expect(() =>
      loadConfig({ ...base, API_KEY_ENCRYPTION_KEY: randomBytes(16).toString('base64') }),
    ).toThrow();
  });

  it('reads previous encryption keys for rotation', () => {
    const previous = [randomBytes(32), randomBytes(32)];
    const config = loadConfig({
      ...base,
      API_KEY_ENCRYPTION_KEY_PREVIOUS: previous.map((key) => key.toString('base64')).join(', '),
    });
    const keys = encryptionKeys(config);
    expect(keys.previous).toHaveLength(2);
    expect(keys.previous[0]?.equals(previous[0]!)).toBe(true);
    expect(() =>
      loadConfig({ ...base, API_KEY_ENCRYPTION_KEY_PREVIOUS: randomBytes(8).toString('base64') }),
    ).toThrow(/32 byte/);
  });
});
