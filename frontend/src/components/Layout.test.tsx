import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../test/server.ts';
import { mockLoggedIn, renderApp } from '../test/render.tsx';

describe('account menu', () => {
  function setup() {
    mockLoggedIn();
    server.use(http.get('/api/entries', () => HttpResponse.json([])));
    renderApp('/');
  }

  it('keeps profile and sign out behind the avatar', async () => {
    setup();
    const trigger = await screen.findByRole('button', { name: 'Account menu' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Profile' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();

    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('anna@example.com')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/profile');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('closes with Escape and returns focus to the avatar', async () => {
    setup();
    const trigger = await screen.findByRole('button', { name: 'Account menu' });
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('link', { name: 'Profile' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes on a click outside and after choosing an entry', async () => {
    setup();
    const trigger = await screen.findByRole('button', { name: 'Account menu' });
    await userEvent.click(trigger);
    await userEvent.click(document.body);
    expect(screen.queryByRole('link', { name: 'Profile' })).not.toBeInTheDocument();

    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('link', { name: 'Profile' }));
    expect(await screen.findByRole('heading', { name: 'Profile' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument(),
    );
  });
});
