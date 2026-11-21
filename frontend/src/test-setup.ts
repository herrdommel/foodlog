import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { initI18n } from './i18n/index.ts';
import { server } from './test/server.ts';

const nodeFetch = globalThis.fetch;
globalThis.fetch = (input, init) =>
  typeof input === 'string' && input.startsWith('/')
    ? nodeFetch(new URL(input, window.location.origin), init)
    : nodeFetch(input, init);

beforeAll(async () => {
  server.listen({ onUnhandledFrame: 'error' });
  await initI18n('en');
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

afterAll(() => server.close());
