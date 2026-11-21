import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../test/server.ts';
import { mockGuest, renderApp } from '../test/render.tsx';

describe('verify email page', () => {
  it('consumes the token exactly once and shows success', async () => {
    mockGuest();
    let calls = 0;
    server.use(
      http.post('/api/auth/verify-email', () => {
        calls += 1;
        return HttpResponse.json({ status: 'verified' });
      }),
    );
    renderApp('/verify-email?token=abcdefghijklmnopqrstuvwxyz');
    expect(await screen.findByText(/Your email address is confirmed/)).toBeInTheDocument();
    expect(calls).toBe(1);
  });

  it('shows an error for invalid tokens', async () => {
    mockGuest();
    server.use(
      http.post('/api/auth/verify-email', () =>
        HttpResponse.json({ error: { code: 'invalid_token', message: '' } }, { status: 400 }),
      ),
    );
    renderApp('/verify-email?token=abcdefghijklmnopqrstuvwxyz');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The link is invalid or has expired.',
    );
  });

  it('shows an error when the token is missing', async () => {
    mockGuest();
    renderApp('/verify-email');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('reset password page', () => {
  it('requires matching passwords and submits the token', async () => {
    mockGuest();
    let body: unknown;
    server.use(
      http.post('/api/auth/reset-password', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ status: 'password_reset' });
      }),
    );
    renderApp('/reset-password?token=abcdefghijklmnopqrstuvwxyz');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('New password'), 'a brand new password');
    await user.type(screen.getByLabelText('Repeat password'), 'something else entirely');
    expect(screen.getByText('The passwords do not match.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    await user.clear(screen.getByLabelText('Repeat password'));
    await user.type(screen.getByLabelText('Repeat password'), 'a brand new password');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Your password has been changed/)).toBeInTheDocument();
    expect(body).toEqual({
      token: 'abcdefghijklmnopqrstuvwxyz',
      password: 'a brand new password',
    });
  });
});

describe('forgot password page', () => {
  it('shows the same confirmation regardless of the account', async () => {
    mockGuest();
    server.use(
      http.post('/api/auth/forgot-password', () =>
        HttpResponse.json({ status: 'ok' }, { status: 202 }),
      ),
    );
    renderApp('/forgot-password');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Email'), 'nobody@example.com');
    await user.click(screen.getByRole('button', { name: 'Send link' }));
    expect(await screen.findByText(/If an account exists/)).toBeInTheDocument();
  });
});
