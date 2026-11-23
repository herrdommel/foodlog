import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { meResponse, mockGuest, mockLoggedIn, renderApp } from '../test/render.tsx';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server.ts';

describe('landing page', () => {
  it('explains the app and offers sign in to guests', async () => {
    mockGuest();
    renderApp('/');
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Find out what your body does not like',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'How it works' })).toBeInTheDocument();
    expect(screen.getByText('Registration is currently by invitation only.')).toBeInTheDocument();
    const shots = within(screen.getByRole('heading', { name: 'A look inside' }).parentElement!);
    expect(shots.getAllByRole('img')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Privacy policy' })).toBeInTheDocument();
  });

  it('links to registration when it is open', async () => {
    mockGuest({ publicRegistration: true, googleLogin: false });
    renderApp('/');
    expect(await screen.findByRole('link', { name: 'Sign up' })).toBeInTheDocument();
    expect(
      screen.queryByText('Registration is currently by invitation only.'),
    ).not.toBeInTheDocument();
  });

  it('shows the dashboard to signed-in users', async () => {
    mockLoggedIn(meResponse);
    server.use(http.get('/api/entries', () => HttpResponse.json([])));
    renderApp('/');
    expect(await screen.findByRole('button', { name: 'Meal' })).toBeInTheDocument();
    expect(screen.queryByText('How it works')).not.toBeInTheDocument();
  });

  it('still sends guests to the login for other pages', async () => {
    mockGuest();
    renderApp('/analysis');
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
  });
});

describe('landing page screenshots', () => {
  it('opens a screenshot in a dialog instead of a new tab', async () => {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
    mockGuest();
    renderApp('/');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Enlarge: The day at a glance' }));
    const dialog = await screen.findByRole('dialog', { name: 'The day at a glance' });
    expect(within(dialog).getByRole('img')).toHaveAttribute('src', '/landing/dashboard-en.jpg');
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('landing page on a phone', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the sign-in form behind a button and opens it in a dialog', async () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
    mockGuest();
    renderApp('/');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sign in' });
    expect(within(dialog).getByLabelText('Email')).toBeInTheDocument();
    expect(within(dialog).getByText('Registration is currently by invitation only.')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });
});
