import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import type {
  AdminSettingsDto,
  AdminUserDetailDto,
  AdminUserDto,
  AuditEntryDto,
  InviteDto,
} from '@foodlog/shared';
import { server } from '../../test/server.ts';
import { meResponse, mockLoggedIn, renderApp } from '../../test/render.tsx';

const admin = { ...meResponse, user: { ...meResponse.user, role: 'admin' as const } };

const anna: AdminUserDto = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'anna@example.com',
  name: 'Anna',
  role: 'user',
  active: true,
  emailVerified: true,
  locale: 'de',
  timezone: 'Europe/Berlin',
  createdAt: '2026-01-05T10:00:00.000Z',
  googleLinked: false,
  hasPassword: true,
  entryCount: 12,
};
const bob: AdminUserDto = {
  ...anna,
  id: '22222222-2222-4222-8222-222222222222',
  email: 'bob@example.com',
  name: 'Bob',
  active: false,
};

const annaDetail: AdminUserDetailDto = {
  ...anna,
  features: [
    {
      key: 'ai_analysis',
      globalEnabled: true,
      defaultForUsers: false,
      override: null,
      effective: false,
    },
    {
      key: 'google_login',
      globalEnabled: true,
      defaultForUsers: true,
      override: null,
      effective: true,
    },
    {
      key: 'data_export',
      globalEnabled: false,
      defaultForUsers: true,
      override: null,
      effective: false,
    },
  ],
};

function mockAdmin() {
  mockLoggedIn(admin);
}

describe('admin access', () => {
  it('shows the admin link only to admins', async () => {
    mockAdmin();
    server.use(http.get('/api/entries', () => HttpResponse.json([])));
    renderApp('/');
    expect(await screen.findByRole('link', { name: 'Admin' })).toBeInTheDocument();
  });

  it('hides the admin link and redirects regular users', async () => {
    mockLoggedIn();
    server.use(http.get('/api/entries', () => HttpResponse.json([])));
    renderApp('/admin/users');
    expect(await screen.findByRole('button', { name: 'Meal' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
  });
});

describe('user list', () => {
  it('lists users with status and searches', async () => {
    mockAdmin();
    const queries: string[] = [];
    server.use(
      http.get('/api/admin/users', ({ request }) => {
        const q = new URL(request.url).searchParams.get('q') ?? '';
        queries.push(q);
        const users = q ? [anna] : [anna, bob];
        return HttpResponse.json({ users, total: users.length, page: 1, pageSize: 25 });
      }),
    );
    renderApp('/admin/users');
    const table = within(await screen.findByRole('table', { name: 'User management' }));
    expect(await table.findByText('anna@example.com')).toBeInTheDocument();
    expect(table.getByText('Deactivated')).toBeInTheDocument();
    expect(table.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('2 users')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Search by name or email'), 'ann');
    await waitFor(() => expect(queries).toContain('ann'));
    await waitFor(() => expect(screen.queryByText('bob@example.com')).not.toBeInTheDocument());
    expect(screen.getByText('1 user')).toBeInTheDocument();
  });

  it('paginates', async () => {
    mockAdmin();
    const pages: string[] = [];
    server.use(
      http.get('/api/admin/users', ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? '1';
        pages.push(page);
        return HttpResponse.json({
          users: [page === '1' ? anna : bob],
          total: 40,
          page: Number(page),
          pageSize: 25,
        });
      }),
    );
    renderApp('/admin/users');
    const user = userEvent.setup();
    expect(await screen.findByText('Page 1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument();
    expect(pages).toContain('2');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });
});

describe('user detail', () => {
  function mockDetail(detail: AdminUserDetailDto = annaDetail) {
    mockAdmin();
    server.use(http.get('/api/admin/users/:id', () => HttpResponse.json(detail)));
  }

  it('shows account facts', async () => {
    mockDetail();
    renderApp(`/admin/users/${anna.id}`);
    expect(await screen.findByRole('heading', { name: 'Anna' })).toBeInTheDocument();
    const facts = within(screen.getByRole('region', { name: 'Account' }));
    expect(facts.getByText('12')).toBeInTheDocument();
    expect(facts.getByText('Europe/Berlin')).toBeInTheDocument();
  });

  it('sends only the changed fields', async () => {
    mockDetail();
    let body: unknown;
    server.use(
      http.patch('/api/admin/users/:id', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ...annaDetail, name: 'Anna B', role: 'admin' });
      }),
    );
    renderApp(`/admin/users/${anna.id}`);
    const user = userEvent.setup();
    const profile = within(await screen.findByRole('region', { name: 'Profile data' }));
    expect(profile.getByRole('button', { name: 'Save' })).toBeDisabled();
    const name = profile.getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Anna B');
    await user.selectOptions(profile.getByLabelText('Role'), 'admin');
    await user.click(profile.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(body).toEqual({ name: 'Anna B', role: 'admin' }));
  });

  it('shows the error for a taken email', async () => {
    mockDetail();
    server.use(
      http.patch('/api/admin/users/:id', () =>
        HttpResponse.json({ error: { code: 'email_taken', message: '' } }, { status: 409 }),
      ),
    );
    renderApp(`/admin/users/${anna.id}`);
    const user = userEvent.setup();
    const profile = within(await screen.findByRole('region', { name: 'Profile data' }));
    const email = profile.getByLabelText('Email');
    await user.clear(email);
    await user.type(email, 'bob@example.com');
    await user.click(profile.getByRole('button', { name: 'Save' }));
    expect(await profile.findByRole('alert')).toHaveTextContent(
      'This email address is already in use.',
    );
  });

  it('deactivates only after confirmation', async () => {
    let current = annaDetail;
    mockAdmin();
    let body: unknown;
    server.use(
      http.get('/api/admin/users/:id', () => HttpResponse.json(current)),
      http.patch('/api/admin/users/:id', async ({ request }) => {
        body = await request.json();
        current = { ...annaDetail, active: false };
        return HttpResponse.json(current);
      }),
    );
    renderApp(`/admin/users/${anna.id}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Deactivate account' }));
    expect(screen.getByText(/Anna will be signed out/)).toBeInTheDocument();
    expect(body).toBeUndefined();
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(body).toEqual({ active: false }));
    expect(await screen.findByRole('button', { name: 'Activate account' })).toBeInTheDocument();
  });

  it('activates a disabled account and disables reset for it', async () => {
    mockDetail({ ...annaDetail, active: false });
    let body: unknown;
    server.use(
      http.patch('/api/admin/users/:id', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(annaDetail);
      }),
    );
    renderApp(`/admin/users/${anna.id}`);
    const user = userEvent.setup();
    expect(await screen.findByRole('button', { name: 'Send link by email' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Activate account' }));
    await waitFor(() => expect(body).toEqual({ active: true }));
  });

  it('prevents admins from changing their own role or status', async () => {
    mockAdmin();
    server.use(
      http.get('/api/admin/users/:id', () =>
        HttpResponse.json({ ...annaDetail, id: admin.user.id, role: 'admin' }),
      ),
    );
    renderApp(`/admin/users/${admin.user.id}`);
    expect(await screen.findByLabelText('Role')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Deactivate account' })).toBeDisabled();
    expect(screen.getByText('You cannot demote or deactivate yourself.')).toBeInTheDocument();
  });

  it('sends a reset email', async () => {
    mockDetail();
    let body: unknown;
    server.use(
      http.post('/api/admin/users/:id/reset-link', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ delivery: 'email', link: null });
      }),
    );
    renderApp(`/admin/users/${anna.id}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Send link by email' }));
    expect(await screen.findByText('The email has been sent.')).toBeInTheDocument();
    expect(body).toEqual({ delivery: 'email' });
  });

  it('shows a created reset link that can be copied', async () => {
    mockDetail();
    server.use(
      http.post('/api/admin/users/:id/reset-link', () =>
        HttpResponse.json({
          delivery: 'link',
          link: 'http://localhost:5173/reset-password?token=abc',
        }),
      ),
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    renderApp(`/admin/users/${anna.id}`);
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await user.click(await screen.findByRole('button', { name: 'Create link' }));
    const field = await screen.findByLabelText('Link to hand over (shown only now)');
    expect(field).toHaveValue('http://localhost:5173/reset-password?token=abc');
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('http://localhost:5173/reset-password?token=abc');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('sets and clears feature overrides and marks globally disabled features', async () => {
    mockDetail();
    const calls: unknown[] = [];
    server.use(
      http.put('/api/admin/users/:id/features/:key', async ({ request, params }) => {
        calls.push({ key: params.key, ...((await request.json()) as object) });
        return HttpResponse.json(annaDetail);
      }),
    );
    renderApp(`/admin/users/${anna.id}`);
    const user = userEvent.setup();
    const features = within(await screen.findByRole('region', { name: 'Features' }));
    await user.selectOptions(features.getByLabelText('AI analysis'), 'on');
    await waitFor(() => expect(calls).toContainEqual({ key: 'ai_analysis', enabled: true }));
    await user.selectOptions(features.getByLabelText('Sign in with Google'), 'off');
    await waitFor(() => expect(calls).toContainEqual({ key: 'google_login', enabled: false }));
    expect(features.getByText('disabled globally')).toBeInTheDocument();
  });
});

describe('invitations', () => {
  const open: InviteDto = {
    id: '33333333-3333-4333-8333-333333333333',
    email: 'carl@example.com',
    createdAt: '2026-11-01T10:00:00.000Z',
    expiresAt: '2026-12-01T10:00:00.000Z',
    usedAt: null,
    usedByEmail: null,
    status: 'open',
  };
  const used: InviteDto = {
    ...open,
    id: '44444444-4444-4444-8444-444444444444',
    email: null,
    status: 'used',
    usedByEmail: 'dora@example.com',
    usedAt: '2026-11-02T10:00:00.000Z',
  };

  it('creates an invitation and shows the link once', async () => {
    mockAdmin();
    let body: unknown;
    server.use(
      http.get('/api/admin/invites', () => HttpResponse.json([])),
      http.post('/api/admin/invites', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          { ...open, link: 'http://localhost:5173/register?invite=secret', emailSent: true },
          { status: 201 },
        );
      }),
    );
    renderApp('/admin/invites');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Email address (optional)'), 'carl@example.com');
    await user.click(screen.getByRole('checkbox', { name: 'Send invitation by email' }));
    await user.click(screen.getByRole('button', { name: 'Create invitation' }));
    expect(await screen.findByLabelText('Invitation link (shown only now)')).toHaveValue(
      'http://localhost:5173/register?invite=secret',
    );
    expect(screen.getByText('The email has been sent.')).toBeInTheDocument();
    expect(body).toEqual({ email: 'carl@example.com', sendMail: true, expiresInDays: 14 });
  });

  it('only allows sending mail when an address is given', async () => {
    mockAdmin();
    server.use(http.get('/api/admin/invites', () => HttpResponse.json([])));
    renderApp('/admin/invites');
    expect(
      await screen.findByRole('checkbox', { name: 'Send invitation by email' }),
    ).toBeDisabled();
  });

  it('lists invitations and revokes open ones only', async () => {
    mockAdmin();
    let revoked: string | undefined;
    server.use(
      http.get('/api/admin/invites', () => HttpResponse.json([open, used])),
      http.delete('/api/admin/invites/:id', ({ params }) => {
        revoked = String(params.id);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp('/admin/invites');
    const user = userEvent.setup();
    expect(await screen.findByText('For carl@example.com')).toBeInTheDocument();
    expect(screen.getByText(/Used by dora@example.com/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Revoke invitation/ })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Revoke invitation carl@example.com' }));
    await waitFor(() => expect(revoked).toBe(open.id));
  });
});

describe('settings', () => {
  const settings: AdminSettingsDto = {
    publicRegistration: false,
    features: [
      { key: 'ai_analysis', enabled: true, defaultForUsers: false },
      { key: 'google_login', enabled: true, defaultForUsers: true },
      { key: 'data_export', enabled: false, defaultForUsers: true },
    ],
  };
  const adminPerson = { id: 'admin-1', name: 'Admin', email: 'admin@example.com' };
  const audit: AuditEntryDto[] = [
    {
      id: 'a1',
      actor: adminPerson,
      targetUser: { id: bob.id, name: 'Bob', email: 'bob@example.com' },
      action: 'user.deactivate',
      detail: null,
      createdAt: '2026-11-20T10:00:00.000Z',
    },
    {
      id: 'a2',
      actor: adminPerson,
      targetUser: null,
      action: 'user.rename',
      detail: null,
      createdAt: '2026-11-19T10:00:00.000Z',
    },
    {
      id: 'a3',
      actor: null,
      targetUser: { id: anna.id, name: 'Anna', email: 'anna@example.com' },
      action: 'user.feature',
      detail: 'ai_analysis=true',
      createdAt: '2026-11-18T10:00:00.000Z',
    },
    {
      id: 'a4',
      actor: adminPerson,
      targetUser: null,
      action: 'setting.public_registration',
      detail: 'false',
      createdAt: '2026-11-17T10:00:00.000Z',
    },
    {
      id: 'a5',
      actor: adminPerson,
      targetUser: null,
      action: 'something.new',
      detail: null,
      createdAt: '2026-11-16T10:00:00.000Z',
    },
  ];

  function mockSettings() {
    mockAdmin();
    server.use(
      http.get('/api/admin/settings', () => HttpResponse.json(settings)),
      http.get('/api/admin/audit', () => HttpResponse.json(audit)),
    );
  }

  it('toggles public registration', async () => {
    mockSettings();
    let body: unknown;
    server.use(
      http.patch('/api/admin/settings', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ...settings, publicRegistration: true });
      }),
    );
    renderApp('/admin/settings');
    const user = userEvent.setup();
    const box = await screen.findByRole('checkbox', { name: 'Allow public registration' });
    expect(box).not.toBeChecked();
    await user.click(box);
    await waitFor(() => expect(body).toEqual({ publicRegistration: true }));
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Allow public registration' })).toBeChecked(),
    );
  });

  it('toggles global feature flags and locks the default when a feature is off', async () => {
    mockSettings();
    const calls: unknown[] = [];
    server.use(
      http.put('/api/admin/features/:key', async ({ request, params }) => {
        calls.push({ key: params.key, ...((await request.json()) as object) });
        return HttpResponse.json(settings);
      }),
    );
    renderApp('/admin/settings');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('checkbox', { name: 'AI analysis: Enabled' }));
    await waitFor(() => expect(calls).toContainEqual({ key: 'ai_analysis', enabled: false }));
    await user.click(screen.getByRole('checkbox', { name: 'AI analysis: Default for users' }));
    await waitFor(() =>
      expect(calls).toContainEqual({ key: 'ai_analysis', defaultForUsers: true }),
    );
    expect(screen.getByRole('checkbox', { name: 'Data export: Default for users' })).toBeDisabled();
  });

  it('shows the activity log with names resolved from account ids', async () => {
    mockSettings();
    renderApp('/admin/settings');
    const log = within(await screen.findByRole('region', { name: 'Activity log' }));

    const deactivated = (await log.findByText('Account deactivated')).closest('li')!;
    const link = within(deactivated).getByRole('link', { name: 'Bob (bob@example.com)' });
    expect(link).toHaveAttribute('href', `/admin/users/${bob.id}`);
    expect(within(deactivated).getByText(/Admin \(admin@example.com\)/)).toBeInTheDocument();

    const renamed = log.getByText('Name changed').closest('li')!;
    expect(within(renamed).getByText(/deleted account/)).toBeInTheDocument();
    expect(within(renamed).queryByRole('link')).not.toBeInTheDocument();

    const feature = log.getByText('Feature changed for user').closest('li')!;
    expect(within(feature).getByText(/AI analysis: on/)).toBeInTheDocument();
    expect(within(feature).getByText(/deleted account · /)).toBeInTheDocument();

    const registration = log.getByText('Public registration changed').closest('li')!;
    expect(within(registration).getByText(/off/)).toBeInTheDocument();
    expect(log.getByText('something.new')).toBeInTheDocument();
  });
});
