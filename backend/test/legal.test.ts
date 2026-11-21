import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, get, type TestApp } from './helpers.ts';

let t: TestApp;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'foodlog-legal-'));
  writeFileSync(join(dir, 'imprint.de.md'), '# Impressum\n\nBetreiber Muster');
  writeFileSync(join(dir, 'imprint.en.md'), '# Imprint\n\nOperator Example');
  writeFileSync(join(dir, 'privacy.de.md'), '# Datenschutz\n');
  writeFileSync(join(dir, 'privacy.en.md'), '   \n');
  t = await createTestApp({ LEGAL_DIR: dir });
});

afterAll(async () => {
  await t.close();
});

describe('GET /api/legal/:doc', () => {
  it('serves the operator text without authentication, German by default', async () => {
    const response = await get(t.app, '/api/legal/imprint');
    expect(response.statusCode).toBe(200);
    expect(response.json().markdown).toContain('Betreiber Muster');
    expect(response.headers['cache-control']).toContain('max-age');
  });

  it('serves the requested language', async () => {
    expect((await get(t.app, '/api/legal/imprint?lang=en')).json().markdown).toContain(
      'Operator Example',
    );
  });

  it('reports missing or empty documents as not configured', async () => {
    const empty = await get(t.app, '/api/legal/privacy?lang=en');
    expect(empty.statusCode).toBe(404);
    expect(empty.json().error.code).toBe('not_configured');
  });

  it('only accepts known documents and languages, so paths cannot be chosen', async () => {
    for (const url of [
      '/api/legal/secrets',
      '/api/legal/..%2Fpackage',
      '/api/legal/imprint?lang=fr',
      '/api/legal/imprint?lang=../x',
    ]) {
      expect((await get(t.app, url)).statusCode, url).toBe(400);
    }
  });

  it('is not configured when the directory does not exist', async () => {
    const other = await createTestApp({ LEGAL_DIR: join(tmpdir(), 'foodlog-does-not-exist') });
    try {
      expect((await get(other.app, '/api/legal/imprint')).json().error.code).toBe('not_configured');
    } finally {
      await other.close();
    }
  });
});
