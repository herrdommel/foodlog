import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import type { Database } from '../src/db/client.ts';

const config = loadConfig({
  NODE_ENV: 'test',
  APP_URL: 'http://localhost:5173',
  DATABASE_URL: 'mysql://u:p@127.0.0.1:3306/db',
  SESSION_SECRET: 'x'.repeat(32),
  API_KEY_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '1025',
  SMTP_FROM: 'Foodlog <foodlog@example.com>',
});

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const app = buildApp({ config, db: {} as Database });
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});

describe('loadConfig', () => {
  it('fails fast on missing values', () => {
    expect(() => loadConfig({})).toThrow(/Invalid environment configuration/);
  });
});
