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
    await user.click(screen.getByRole('checkbox', { name: /privacy policy/ }));
    await user.click(screen.getByRole('button', { name: 'Sign up' }));

    expect(
      await screen.findByText('Please check your inbox and confirm your email address.'),
    ).toBeInTheDocument();
    expect(body).toMatchObject({
      name: 'Anna',
      email: 'anna@example.com',
      locale: 'en',
      inviteToken: 'abcdefghijklmnopqrstuvwxyz',
      acceptPrivacy: true,
    });
  });

  it('cannot be submitted without accepting the privacy policy', async () => {
    mockGuest({ publicRegistration: true, googleLogin: true });
    let called = false;
    server.use(
      http.post('/api/auth/register', () => {
        called = true;
        return HttpResponse.json({ status: 'verification_sent' }, { status: 202 });
      }),
    );
    renderApp('/register');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Name'), 'Anna');
    await user.type(screen.getByLabelText('Email'), 'anna@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse battery');

    const submit = screen.getByRole('button', { name: 'Sign up' });
    expect(submit).toBeDisabled();
    expect(called).toBe(false);
    const privacy = screen.getByRole('link', { name: 'privacy policy' });
    expect(privacy).toHaveAttribute('href', '/privacy');
    expect(privacy).toHaveAttribute('target', '_blank');
    await user.click(screen.getByRole('checkbox', { name: /privacy policy/ }));
    expect(submit).toBeEnabled();
  });

  it('only enables Google sign-up after the consent and passes it on', async () => {
    mockGuest({ publicRegistration: true, googleLogin: true });
    renderApp('/register?invite=abcdefghijklmnopqrstuvwxyz');
    const user = userEvent.setup();
    const google = await screen.findByRole('link', { name: 'Continue with Google' });
    expect(google).toHaveAttribute('aria-disabled', 'true');
    expect(google).not.toHaveAttribute('href');

    await user.click(screen.getByRole('checkbox', { name: /privacy policy/ }));
    const enabled = screen.getByRole('link', { name: 'Continue with Google' });
    const href = enabled.getAttribute('href')!;
    expect(href.startsWith('/api/auth/google?')).toBe(true);
    const query = new URLSearchParams(href.split('?')[1]);
    expect(query.get('consent')).toBe('1');
    expect(query.get('invite')).toBe('abcdefghijklmnopqrstuvwxyz');
  });

  it('allows registration without invitation when public registration is on', async () => {
    mockGuest({ publicRegistration: true, googleLogin: false });
    renderApp('/register');
    expect(await screen.findByLabelText('Name')).toBeInTheDocument();
  });
});
