import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';
import { createTestApp, get, type TestApp } from './helpers.ts';

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});

afterAll(async () => {
  await t.close();
});

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const response = await get(t.app, '/api/health');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});

describe('loadConfig', () => {
  it('fails fast on missing values', () => {
    expect(() => loadConfig({})).toThrow(/Invalid environment configuration/);
  });
});
