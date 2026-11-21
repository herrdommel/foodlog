import { expect, type APIRequestContext, type Page } from '@playwright/test';

const BACKEND = 'http://127.0.0.1:3100';
export const ORIGIN = 'http://localhost:5174';
export const PASSWORD = 'correct horse battery';

let counter = 0;
export function uniqueEmail(prefix = 'user') {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}@example.com`;
}

export async function createInvite(request: APIRequestContext): Promise<string> {
  const response = await request.get(`${BACKEND}/__test/invite`);
  return ((await response.json()) as { token: string }).token;
}

export async function latestMailLink(
  request: APIRequestContext,
  to: string,
  pathFragment: string,
): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(async () => {
      const response = await request.get(`${BACKEND}/__test/mail`, { params: { to } });
      const mails = (await response.json()) as { text: string }[];
      link = mails
        .map((mail) =>
          mail.text.match(/https?:\/\/\S+/g)?.find((url) => url.includes(pathFragment)),
        )
        .filter(Boolean)
        .at(-1);
      return link;
    })
    .toBeTruthy();
  return link!;
}

export async function registerVerified(
  page: Page,
  options: { email?: string; name?: string; locale?: 'de' | 'en' } = {},
) {
  const email = options.email ?? uniqueEmail();
  const name = options.name ?? 'Anna Beispiel';
  const request = page.request;
  const inviteToken = await createInvite(request);
  const register = await request.post('/api/auth/register', {
    headers: { origin: ORIGIN },
    data: {
      name,
      email,
      password: PASSWORD,
      locale: options.locale ?? 'en',
      inviteToken,
      acceptPrivacy: true,
    },
  });
  expect(register.status()).toBe(202);
  const link = await latestMailLink(request, email, '/verify-email');
  const token = new URL(link).searchParams.get('token');
  const verify = await request.post('/api/auth/verify-email', {
    headers: { origin: ORIGIN },
    data: { token },
  });
  expect(verify.ok()).toBe(true);
  return { email, name };
}

export async function loginViaApi(page: Page, email: string, password = PASSWORD) {
  const response = await page.request.post('/api/auth/login', {
    headers: { origin: ORIGIN },
    data: { email, password },
  });
  expect(response.ok()).toBe(true);
}

export async function seedDemoData(page: Page, email: string) {
  const response = await page.request.get('http://127.0.0.1:3100/__test/seed-demo', {
    params: { email },
  });
  expect(response.ok()).toBe(true);
}

export async function setFeature(page: Page, email: string, key: string, enabled: boolean) {
  const response = await page.request.get('http://127.0.0.1:3100/__test/feature', {
    params: { email, key, enabled: String(enabled) },
  });
  expect(response.ok()).toBe(true);
}

export async function makeOnlyAdmin(page: Page, email: string) {
  const response = await page.request.get('http://127.0.0.1:3100/__test/only-admin', {
    params: { email },
  });
  expect(response.ok()).toBe(true);
}

export async function promoteToAdmin(page: Page, email: string) {
  const response = await page.request.get('http://127.0.0.1:3100/__test/promote', {
    params: { email },
  });
  expect(response.ok()).toBe(true);
}
