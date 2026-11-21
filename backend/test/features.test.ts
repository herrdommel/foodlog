import { describe, expect, it } from 'vitest';
import { resolveFlag } from '@foodlog/shared';
import { afterAll, beforeAll } from 'vitest';
import { featureFlags, userFeatureOverrides, users } from '../src/db/schema.ts';
import { newId } from '../src/lib/crypto.ts';
import { resolveFeatures } from '../src/services/features.ts';
import { createTestApp, type TestApp } from './helpers.ts';

describe('resolveFlag', () => {
  it('global off beats everything', () => {
    expect(resolveFlag({ enabled: false, defaultForUsers: true }, 'ai_analysis', true)).toBe(false);
  });

  it('user override beats the default when globally on', () => {
    expect(resolveFlag({ enabled: true, defaultForUsers: false }, 'ai_analysis', true)).toBe(true);
    expect(resolveFlag({ enabled: true, defaultForUsers: true }, 'ai_analysis', false)).toBe(false);
  });

  it('falls back to the registry default without a row', () => {
    expect(resolveFlag(undefined, 'ai_analysis', undefined)).toBe(false);
    expect(resolveFlag(undefined, 'data_export', undefined)).toBe(true);
  });
});

describe('resolveFeatures', () => {
  let t: TestApp;
  const userId = newId();

  beforeAll(async () => {
    t = await createTestApp();
    await t.db.insert(users).values({ id: userId, email: 'f@example.com', name: 'F' });
  });

  afterAll(async () => {
    await t.close();
  });

  it('combines flag rows and per-user overrides', async () => {
    expect((await resolveFeatures(t.db, userId)).ai_analysis).toBe(false);

    await t.db.insert(userFeatureOverrides).values({ userId, key: 'ai_analysis', enabled: true });
    expect((await resolveFeatures(t.db, userId)).ai_analysis).toBe(true);

    await t.db
      .insert(featureFlags)
      .values({ key: 'ai_analysis', enabled: false, defaultForUsers: false });
    expect((await resolveFeatures(t.db, userId)).ai_analysis).toBe(false);
  });
});
