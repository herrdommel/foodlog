import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeResponse } from '@foodlog/shared';
import { server } from '../test/server.ts';
import { meResponse, mockGuest, mockLoggedIn, renderApp } from '../test/render.tsx';

const passkeys = vi.hoisted(() => ({
  passkeysSupported: vi.fn(() => true),
  createPasskey: vi.fn(),
  assertPasskey: vi.fn(),
}));
vi.mock('../lib/passkeys.ts', () => passkeys);

const challenge = { challenge: 'abc' };

function fail(code: string, status = 401) {
  return HttpResponse.json({ error: { code, message: code } }, { status });
}

async function passwordStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Email'), 'anna@example.com');
  await user.type(screen.getByLabelText('Password'), 'correct horse battery');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

beforeEach(() => {
  passkeys.passkeysSupported.mockReturnValue(true);
  passkeys.createPasskey.mockReset();
  passkeys.assertPasskey.mockReset();
});

describe('sign-in with a second factor', () => {
  it('asks for the code and signs in with it', async () => {
    mockGuest();
    let body: unknown;
    server.use(
      http.get('/api/entries', () => HttpResponse.json([])),
      http.post('/api/auth/login', () =>
        HttpResponse.json({ mfaRequired: true, methods: ['totp', 'recovery'] }),
      ),
      http.post('/api/auth/mfa/totp', async ({ request }) => {
        body = await request.json();
        server.use(http.get('/api/me', () => HttpResponse.json(meResponse)));
        return HttpResponse.json({ user: meResponse.user });
      }),
    );
    renderApp('/login');
    const user = userEvent.setup();
    await passwordStep(user);
    await user.type(await screen.findByLabelText('Code from your authenticator app'), '123 456');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByRole('button', { name: 'Meal' })).toBeInTheDocument();
    expect(body).toEqual({ code: '123 456' });
  });

  it('switches to a recovery code and back, and shows a wrong code', async () => {
    mockGuest();
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({ mfaRequired: true, methods: ['totp', 'recovery'] }),
      ),
      http.post('/api/auth/mfa/recovery', () => fail('invalid_code')),
    );
    renderApp('/login');
    const user = userEvent.setup();
    await passwordStep(user);
    await user.click(await screen.findByRole('button', { name: 'Use a recovery code' }));
    await user.type(screen.getByLabelText('Recovery code'), 'abcd-efgh-jkmn');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The code is not correct.');
    await user.click(screen.getByRole('button', { name: 'Use the authenticator app' }));
    expect(screen.getByLabelText('Code from your authenticator app')).toBeInTheDocument();
  });

  it('goes back to the password step', async () => {
    mockGuest();
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({ mfaRequired: true, methods: ['totp', 'recovery'] }),
      ),
    );
    renderApp('/login');
    const user = userEvent.setup();
    await passwordStep(user);
    await user.click(await screen.findByRole('button', { name: 'Back to sign-in' }));
    expect(await screen.findByLabelText('Password')).toBeInTheDocument();
  });

  it('offers only the passkey and recovery when there is no app', async () => {
    mockGuest();
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({ mfaRequired: true, methods: ['passkey', 'recovery'] }),
      ),
    );
    renderApp('/login');
    const user = userEvent.setup();
    await passwordStep(user);
    expect(await screen.findByRole('button', { name: 'Use a passkey' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Code from your authenticator app')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use a recovery code' }));
    expect(screen.getByLabelText('Recovery code')).toBeInTheDocument();
  });

  it('uses a passkey as the second step', async () => {
    mockGuest();
    passkeys.assertPasskey.mockResolvedValue({ id: 'cred' });
    let verified: unknown;
    server.use(
      http.get('/api/entries', () => HttpResponse.json([])),
      http.post('/api/auth/login', () =>
        HttpResponse.json({ mfaRequired: true, methods: ['passkey', 'recovery'] }),
      ),
      http.post('/api/auth/mfa/passkey/options', () => HttpResponse.json({ options: challenge })),
      http.post('/api/auth/mfa/passkey/verify', async ({ request }) => {
        verified = await request.json();
        server.use(http.get('/api/me', () => HttpResponse.json(meResponse)));
        return HttpResponse.json({ user: meResponse.user });
      }),
    );
    renderApp('/login');
    const user = userEvent.setup();
    await passwordStep(user);
    await user.click(await screen.findByRole('button', { name: 'Use a passkey' }));
    expect(await screen.findByRole('button', { name: 'Meal' })).toBeInTheDocument();
    expect(passkeys.assertPasskey).toHaveBeenCalledWith(challenge);
    expect(verified).toEqual({ response: { id: 'cred' } });
  });

  it('signs in with a passkey alone', async () => {
    mockGuest();
    passkeys.assertPasskey.mockResolvedValue({ id: 'cred' });
    server.use(
      http.get('/api/entries', () => HttpResponse.json([])),
      http.post('/api/auth/passkey/options', () => HttpResponse.json({ options: challenge })),
      http.post('/api/auth/passkey/verify', () => {
        server.use(http.get('/api/me', () => HttpResponse.json(meResponse)));
        return HttpResponse.json({ user: meResponse.user });
      }),
    );
    renderApp('/login');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Use a passkey instead' }));
    expect(await screen.findByRole('button', { name: 'Meal' })).toBeInTheDocument();
  });

  it('explains a cancelled passkey prompt and hides the button without support', async () => {
    mockGuest();
    const { ApiError } = await import('../api/client.ts');
    passkeys.assertPasskey.mockRejectedValue(new ApiError(0, 'passkey_cancelled', ''));
    server.use(
      http.post('/api/auth/passkey/options', () => HttpResponse.json({ options: challenge })),
    );
    const view = renderApp('/login');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Use a passkey instead' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('cancelled or timed out');
    view.unmount();

    passkeys.passkeysSupported.mockReturnValue(false);
    renderApp('/login');
    await screen.findByLabelText('Email');
    expect(screen.queryByRole('button', { name: 'Use a passkey instead' })).toBeNull();
  });
});

const withMfa = (mfa: Partial<MeResponse['mfa']>): MeResponse => ({
  ...meResponse,
  mfa: { ...meResponse.mfa, ...mfa },
});

describe('two-factor settings', () => {
  it('sets up the authenticator app and shows the recovery codes once', async () => {
    mockLoggedIn();
    let confirmBody: unknown;
    server.use(
      http.post('/api/me/mfa/totp/setup', () =>
        HttpResponse.json({
          secret: 'JBSWY3DPEHPK3PXP',
          otpauthUrl: 'otpauth://totp/Foodlog:anna?secret=JBSWY3DPEHPK3PXP&issuer=Foodlog',
        }),
      ),
      http.post('/api/me/mfa/totp/confirm', async ({ request }) => {
        confirmBody = await request.json();
        server.use(
          http.get('/api/me', () => HttpResponse.json(withMfa({ enabled: true, totp: true }))),
        );
        return HttpResponse.json({ recoveryCodes: ['aaaa-bbbb-cccc', 'dddd-eeee-ffff'] });
      }),
    );
    renderApp('/profile');
    const user = userEvent.setup();
    expect(screen.queryByLabelText('Password to confirm changes')).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Set up authenticator app' }));
    expect(
      await screen.findByRole('img', { name: 'QR code for the authenticator app' }),
    ).toBeInTheDocument();
    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Code from the app'), '654321');
    await user.type(screen.getByLabelText('Password to confirm changes'), 'secret password');
    await user.click(screen.getByRole('button', { name: 'Confirm and activate' }));

    expect(await screen.findByText('aaaa-bbbb-cccc')).toBeInTheDocument();
    expect(confirmBody).toEqual({ code: '654321', password: 'secret password' });
    expect(await screen.findByText('The authenticator app is active.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'I saved them' }));
    expect(screen.queryByText('aaaa-bbbb-cccc')).not.toBeInTheDocument();
  });

  it('adds, renames and removes a passkey', async () => {
    server.use(http.get('/api/me', () => HttpResponse.json(meResponse)));
    passkeys.createPasskey.mockResolvedValue({ id: 'new' });
    let added: unknown;
    let removed: unknown;
    const existing = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Laptop',
      backedUp: true,
      createdAt: '2026-11-01T10:00:00.000Z',
      lastUsedAt: null,
    };
    server.use(
      http.post('/api/me/mfa/passkeys/options', () => HttpResponse.json({ options: challenge })),
      http.post('/api/me/mfa/passkeys', async ({ request }) => {
        added = await request.json();
        server.use(
          http.get('/api/me', () =>
            HttpResponse.json(withMfa({ enabled: true, passkeys: [existing] })),
          ),
        );
        return HttpResponse.json({ passkey: existing, recoveryCodes: ['zzzz-yyyy-xxxx'] });
      }),
      http.patch('/api/me/mfa/passkeys/:id', () => new HttpResponse(null, { status: 204 })),
      http.post('/api/me/mfa/passkeys/:id/delete', async ({ request }) => {
        removed = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp('/profile');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Add a passkey' }));
    await user.type(screen.getByLabelText('Passkey name'), 'Laptop');
    await user.type(screen.getByLabelText('Password to confirm changes'), 'secret password');
    await user.click(screen.getByRole('button', { name: 'Create passkey' }));
    expect(await screen.findByText('zzzz-yyyy-xxxx')).toBeInTheDocument();
    expect(added).toEqual({ name: 'Laptop', response: { id: 'new' } });
    expect(screen.getByText(/Not used yet/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove Laptop' }));
    await user.type(screen.getByLabelText('Password to confirm changes'), 'secret password');
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(removed).toEqual({ password: 'secret password' }));
  });

  it('tells administrators without a second factor to set one up', async () => {
    const admin: MeResponse = {
      ...meResponse,
      user: { ...meResponse.user, role: 'admin' },
      mfa: { ...meResponse.mfa, required: true },
    };
    server.use(http.get('/api/me', () => HttpResponse.json(admin)));
    renderApp('/admin/users');
    expect(await screen.findByRole('heading', { name: 'Profile' })).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Second factor required');
    expect(screen.getByRole('alert')).toHaveTextContent('Administrators need a second factor');
  });
});
