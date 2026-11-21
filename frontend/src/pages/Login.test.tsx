import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../test/server.ts';
import { meResponse, mockGuest, renderApp } from '../test/render.tsx';

function fail(code: string, status = 401) {
  return HttpResponse.json({ error: { code, message: code } }, { status });
}

describe('login page', () => {
  it('signs in and shows the dashboard', async () => {
    mockGuest();
    let body: unknown;
    server.use(
      http.get('/api/entries', () => HttpResponse.json([])),
      http.post('/api/auth/login', async ({ request }) => {
        body = await request.json();
        server.use(http.get('/api/me', () => HttpResponse.json(meResponse)));
        return HttpResponse.json({ user: meResponse.user });
      }),
    );
    renderApp('/login');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Email'), 'anna@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('button', { name: 'Meal' })).toBeInTheDocument();
    expect(body).toEqual({ email: 'anna@example.com', password: 'correct horse battery' });
  });

  it('shows a translated error for wrong credentials', async () => {
    mockGuest();
    server.use(http.post('/api/auth/login', () => fail('invalid_credentials')));
    renderApp('/login');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Email'), 'anna@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
  });

  it('offers to resend the confirmation mail for unverified accounts', async () => {
    mockGuest();
    let resent = false;
    server.use(
      http.post('/api/auth/login', () => fail('email_not_verified', 403)),
      http.post('/api/auth/resend-verification', () => {
        resent = true;
        return HttpResponse.json({ status: 'ok' }, { status: 202 });
      }),
    );
    renderApp('/login');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Email'), 'anna@example.com');
    await user.type(screen.getByLabelText('Password'), 'whatever password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await user.click(await screen.findByRole('button', { name: 'Resend confirmation email' }));
    await waitFor(() => expect(resent).toBe(true));
  });

  it('shows the register link and Google button only when enabled', async () => {
    mockGuest({ publicRegistration: true, googleLogin: true });
    renderApp('/login');
    expect(await screen.findByRole('link', { name: 'Sign up' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue with Google' })).toHaveAttribute(
      'href',
      '/api/auth/google',
    );
  });

  it('hides the register link when registration is closed', async () => {
    mockGuest();
    renderApp('/login');
    await screen.findByRole('button', { name: 'Sign in' });
    expect(screen.queryByRole('link', { name: 'Sign up' })).not.toBeInTheDocument();
  });

  it('redirects unauthenticated users from protected pages', async () => {
    mockGuest();
    renderApp('/profile');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});
