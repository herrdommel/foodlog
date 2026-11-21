import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../test/server.ts';
import { mockGuest, renderApp } from '../test/render.tsx';

describe('register page', () => {
  it('requires an invitation when public registration is off', async () => {
    mockGuest();
    renderApp('/register');
    expect(
      await screen.findByText('Registration is only possible with an invitation link.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('registers with the invitation token from the URL', async () => {
    mockGuest();
    let body: Record<string, unknown> = {};
    server.use(
      http.post('/api/auth/register', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ status: 'verification_sent' }, { status: 202 });
      }),
    );
    renderApp('/register?invite=abcdefghijklmnopqrstuvwxyz');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Name'), 'Anna');
    await user.type(screen.getByLabelText('Email'), 'anna@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Sign up' }));

    expect(
      await screen.findByText('Please check your inbox and confirm your email address.'),
    ).toBeInTheDocument();
    expect(body).toMatchObject({
      name: 'Anna',
      email: 'anna@example.com',
      locale: 'en',
      inviteToken: 'abcdefghijklmnopqrstuvwxyz',
    });
  });

  it('allows registration without invitation when public registration is on', async () => {
    mockGuest({ publicRegistration: true, googleLogin: false });
    renderApp('/register');
    expect(await screen.findByLabelText('Name')).toBeInTheDocument();
  });
});
