import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../test/server.ts';
import { meResponse, mockLoggedIn, renderApp } from '../test/render.tsx';

describe('profile page', () => {
  it('shows account data', async () => {
    mockLoggedIn();
    renderApp('/profile');
    expect(await screen.findByRole('heading', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByText('anna@example.com')).toBeInTheDocument();
  });

  it('changes the avatar to a preset', async () => {
    mockLoggedIn();
    let body: unknown;
    server.use(
      http.patch('/api/me', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          ...meResponse,
          user: { ...meResponse.user, avatar: 'preset:4' },
        });
      }),
    );
    renderApp('/profile');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Choose avatar 4' }));
    expect(body).toEqual({ avatar: 'preset:4' });
    expect(await screen.findByRole('button', { name: 'Choose avatar 4' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('requests an email change with the current password', async () => {
    mockLoggedIn();
    let body: unknown;
    server.use(
      http.post('/api/me/email', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ status: 'confirmation_sent' }, { status: 202 });
      }),
    );
    renderApp('/profile');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('New email address'), 'new@example.com');
    await user.type(screen.getByLabelText('Current password'), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Request change' }));
    expect(
      await screen.findByText('We sent a confirmation link to the new address.'),
    ).toBeInTheDocument();
    expect(body).toEqual({ newEmail: 'new@example.com', password: 'correct horse battery' });
  });

  it('does not ask Google-only users for a password', async () => {
    mockLoggedIn({ ...meResponse, user: { ...meResponse.user, hasPassword: false } });
    renderApp('/profile');
    await screen.findByLabelText('New email address');
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();
  });

  it('sends a password reset link', async () => {
    mockLoggedIn();
    server.use(
      http.post('/api/me/password-reset', () =>
        HttpResponse.json({ status: 'ok' }, { status: 202 }),
      ),
    );
    renderApp('/profile');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText('The link has been sent.')).toBeInTheDocument();
  });
});
