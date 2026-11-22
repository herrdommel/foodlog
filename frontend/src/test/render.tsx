import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { http, HttpResponse } from 'msw';
import type { MeResponse } from '@foodlog/shared';
import { AppRoutes } from '../App.tsx';
import { server } from './server.ts';

export function renderApp(route: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

export function renderElement(ui: ReactElement, route = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

export const meResponse: MeResponse = {
  user: {
    id: 'u1',
    email: 'anna@example.com',
    name: 'Anna',
    avatar: 'preset:1',
    avatarVersion: 0,
    role: 'user',
    locale: 'en',
    timezone: 'Europe/Berlin',
    hasPassword: true,
    googleLinked: false,
  },
  features: {
    ai_analysis: false,
    google_login: true,
    data_export: true,
    barcode_scan: true,
  },
};

export function mockGuest(config = { publicRegistration: false, googleLogin: false }) {
  server.use(
    http.get('/api/me', () =>
      HttpResponse.json({ error: { code: 'unauthenticated', message: '' } }, { status: 401 }),
    ),
    http.get('/api/auth/config', () => HttpResponse.json(config)),
  );
}

export function mockLoggedIn(me: MeResponse = meResponse) {
  server.use(http.get('/api/me', () => HttpResponse.json(me)));
}
