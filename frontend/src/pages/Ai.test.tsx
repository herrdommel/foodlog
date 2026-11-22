import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { AiPreviewDto, AiResultDto, AiSettingsDto } from '@foodlog/shared';
import { server } from '../test/server.ts';
import { meResponse, mockLoggedIn, renderApp } from '../test/render.tsx';

const withAi = { ...meResponse, features: { ...meResponse.features, ai_analysis: true } };

function settings(overrides: Partial<AiSettingsDto> = {}): AiSettingsDto {
  return {
    provider: null,
    model: null,
    keys: {
      anthropic: { configured: false, last4: null },
      openai: { configured: false, last4: null },
    },
    consent: { given: false, version: 0, currentVersion: 1, at: null },
    photoConsent: { given: false, at: null },
    ...overrides,
  };
}

const readySettings = settings({
  provider: 'anthropic',
  model: 'mock-large',
  keys: {
    anthropic: { configured: true, last4: '1234' },
    openai: { configured: false, last4: null },
  },
  consent: { given: true, version: 1, currentVersion: 1, at: '2026-11-20T10:00:00.000Z' },
});

const preview: AiPreviewDto = {
  system: 'SYSTEM PROMPT TEXT',
  data: { entryCount: 3, entries: [{ type: 'meal', title: 'Müsli' }] },
  entryCount: 3,
  truncated: false,
  bytes: 2048,
  payloadHash: 'a'.repeat(64),
};

const result: AiResultDto = {
  text: 'Line one.\n\nLine two <b>not html</b>',
  provider: 'anthropic',
  model: 'mock-large',
  payloadHash: 'a'.repeat(64),
  generatedAt: '2026-11-21T10:00:00.000Z',
};

function mockAi(current: AiSettingsDto, features = withAi) {
  mockLoggedIn(features);
  let state = current;
  server.use(
    http.get('/api/ai/settings', () => HttpResponse.json(state)),
    http.get('/api/ai/models', () =>
      HttpResponse.json({ models: ['mock-large', 'mock-small'], suggested: 'mock-small' }),
    ),
  );
  return {
    set(next: AiSettingsDto) {
      state = next;
    },
  };
}

describe('navigation and access', () => {
  it('shows the AI link only when the feature is on', async () => {
    mockAi(settings());
    server.use(http.get('/api/entries', () => HttpResponse.json([])));
    renderApp('/');
    expect(await screen.findByRole('link', { name: 'AI' })).toBeInTheDocument();
  });

  it('hides the link and redirects when the feature is off', async () => {
    mockLoggedIn();
    server.use(http.get('/api/entries', () => HttpResponse.json([])));
    renderApp('/ai');
    expect(await screen.findByRole('button', { name: 'Meal' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'AI' })).not.toBeInTheDocument();
  });
});

describe('provider and key', () => {
  it('saves a key without ever showing it again', async () => {
    const state = mockAi(settings());
    let body: unknown;
    server.use(
      http.put('/api/ai/keys/:provider', async ({ request, params }) => {
        body = { provider: params.provider, ...((await request.json()) as object) };
        state.set(
          settings({
            provider: 'anthropic',
            keys: {
              anthropic: { configured: true, last4: '5678' },
              openai: { configured: false, last4: null },
            },
          }),
        );
        return HttpResponse.json(
          settings({
            provider: 'anthropic',
            keys: {
              anthropic: { configured: true, last4: '5678' },
              openai: { configured: false, last4: null },
            },
          }),
        );
      }),
    );
    renderApp('/ai');
    const user = userEvent.setup();
    const field = await screen.findByLabelText('API key');
    expect(field).toHaveAttribute('type', 'password');
    await user.type(field, 'sk-ant-secret-5678');
    await user.click(screen.getByRole('button', { name: 'Save key' }));

    expect(await screen.findByText('Key stored (ends in 5678)')).toBeInTheDocument();
    expect(body).toEqual({ provider: 'anthropic', apiKey: 'sk-ant-secret-5678' });
    expect(screen.queryByDisplayValue('sk-ant-secret-5678')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('sk-ant-secret');
  });

  it('shows the provider message for a rejected key', async () => {
    mockAi(settings());
    server.use(
      http.put('/api/ai/keys/:provider', () =>
        HttpResponse.json({ error: { code: 'invalid_api_key', message: '' } }, { status: 400 }),
      ),
    );
    renderApp('/ai');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('API key'), 'sk-wrong-key-1');
    await user.click(screen.getByRole('button', { name: 'Save key' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The provider rejected the API key.',
    );
  });

  it('keeps the save button disabled for short keys', async () => {
    mockAi(settings());
    renderApp('/ai');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('API key'), 'short');
    expect(screen.getByRole('button', { name: 'Save key' })).toBeDisabled();
  });

  it('deletes a stored key', async () => {
    mockAi(readySettings);
    let deleted: string | undefined;
    server.use(
      http.delete('/api/ai/keys/:provider', ({ params }) => {
        deleted = String(params.provider);
        return HttpResponse.json(settings());
      }),
    );
    renderApp('/ai');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Delete key' }));
    await waitFor(() => expect(deleted).toBe('anthropic'));
    expect(await screen.findByLabelText('API key')).toBeInTheDocument();
  });

  it('lets the user replace a stored key', async () => {
    mockAi(readySettings);
    renderApp('/ai');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Replace key' }));
    expect(screen.getByLabelText('API key')).toHaveValue('');
  });

  it('loads models, preselects the recommendation and saves the choice', async () => {
    mockAi({ ...readySettings, model: null });
    let patched: unknown;
    server.use(
      http.patch('/api/ai/settings', async ({ request }) => {
        patched = await request.json();
        return HttpResponse.json(readySettings);
      }),
    );
    renderApp('/ai');
    const user = userEvent.setup();
    const select = await screen.findByLabelText('Model');
    await waitFor(() => expect(select).toHaveValue('mock-small'));
    expect(screen.getByRole('option', { name: 'mock-small (Recommended)' })).toBeInTheDocument();
    await user.selectOptions(select, 'mock-large');
    await user.click(screen.getByRole('button', { name: 'Save model' }));
    await waitFor(() => expect(patched).toEqual({ model: 'mock-large' }));
  });

  it('switches to a provider that already has a key', async () => {
    mockAi({
      ...readySettings,
      keys: { ...readySettings.keys, openai: { configured: true, last4: '1234' } },
    });
    let patched: unknown;
    server.use(
      http.patch('/api/ai/settings', async ({ request }) => {
        patched = await request.json();
        return HttpResponse.json(readySettings);
      }),
    );
    renderApp('/ai');
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText('Provider'), 'openai');
    await waitFor(() => expect(patched).toEqual({ provider: 'openai' }));
  });

  it('lets you pick a provider without a key and enter one', async () => {
    mockAi(readySettings);
    let patched = false;
    let saved: unknown;
    server.use(
      http.patch('/api/ai/settings', () => {
        patched = true;
        return HttpResponse.json(readySettings);
      }),
      http.put('/api/ai/keys/:provider', async ({ request, params }) => {
        saved = { provider: params.provider, ...((await request.json()) as object) };
        return HttpResponse.json(readySettings);
      }),
    );
    renderApp('/ai');
    const user = userEvent.setup();
    const select = await screen.findByLabelText('Provider');
    await user.selectOptions(select, 'openai');
    expect(select).toHaveValue('openai');
    expect(patched).toBe(false);
    await user.type(await screen.findByLabelText('API key'), 'sk-openai-secret-9999');
    await user.click(screen.getByRole('button', { name: 'Save key' }));
    await waitFor(() =>
      expect(saved).toEqual({ provider: 'openai', apiKey: 'sk-openai-secret-9999' }),
    );
  });
});

describe('consent', () => {
  it('requires ticking the box and can be withdrawn', async () => {
    const state = mockAi(settings());
    const calls: string[] = [];
    server.use(
      http.post('/api/ai/consent', async ({ request }) => {
        calls.push(`give ${JSON.stringify(await request.json())}`);
        state.set(readySettings);
        return HttpResponse.json(readySettings);
      }),
      http.delete('/api/ai/consent', () => {
        calls.push('withdraw');
        state.set(settings());
        return HttpResponse.json(settings());
      }),
    );
    renderApp('/ai');
    const user = userEvent.setup();
    const consent = within(await screen.findByRole('region', { name: 'Consent' }));
    expect(consent.getByRole('button', { name: 'Give consent' })).toBeDisabled();
    await user.click(consent.getByRole('checkbox'));
    await user.click(consent.getByRole('button', { name: 'Give consent' }));
    expect(await consent.findByText(/Consent given on/)).toBeInTheDocument();
    expect(calls).toEqual(['give {"version":2}']);

    await user.click(consent.getByRole('button', { name: 'Withdraw consent' }));
    await waitFor(() => expect(calls).toContain('withdraw'));
    expect(await consent.findByRole('button', { name: 'Give consent' })).toBeInTheDocument();
  });
});

describe('running the analysis', () => {
  it('explains what is missing and blocks the start', async () => {
    mockAi(settings());
    renderApp('/ai');
    expect(
      await screen.findByText(/Choose a provider and a model, store a key/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start AI analysis' })).toBeDisabled();
  });

  it('shows the data that will be sent before sending it', async () => {
    mockAi(readySettings);
    let body: Record<string, unknown> = {};
    server.use(
      http.post('/api/ai/preview', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(preview);
      }),
    );
    renderApp('/ai?from=2026-01-01&to=2026-01-30&window=24&outcome=bloating&minSeverity=5');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Show data to be sent' }));
    const panel = within(await screen.findByRole('region', { name: 'This data will be sent' }));
    expect(panel.getByText(/3 entries/)).toBeInTheDocument();
    expect(panel.getByText(/2\.0 KB/)).toBeInTheDocument();
    expect(panel.getByText('SYSTEM PROMPT TEXT')).toBeInTheDocument();
    expect(panel.getByText(/Müsli/)).toBeInTheDocument();
    expect(panel.getByText('aaaaaaaaaaaaaaaa')).toBeInTheDocument();
    expect(body).toEqual({
      from: '2026-01-01',
      to: '2026-01-30',
      window: 24,
      outcome: 'bloating',
      minSeverity: 5,
    });
  });

  it('warns when the diary was truncated', async () => {
    mockAi(readySettings);
    server.use(
      http.post('/api/ai/preview', () =>
        HttpResponse.json({ ...preview, truncated: true, entryCount: 300 }),
      ),
    );
    renderApp('/ai');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Show data to be sent' }));
    expect(
      await screen.findByText('Only the most recent 300 entries are included.'),
    ).toBeInTheDocument();
  });

  it('shows the answer as plain text and confirms the data matches the preview', async () => {
    mockAi(readySettings);
    server.use(
      http.post('/api/ai/preview', () => HttpResponse.json(preview)),
      http.post('/api/ai/analyze', () => HttpResponse.json(result)),
    );
    renderApp('/ai');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Show data to be sent' }));
    await screen.findByRole('region', { name: 'This data will be sent' });
    await user.click(screen.getByRole('button', { name: 'Start AI analysis' }));

    const output = within(await screen.findByRole('region', { name: 'Result' }));
    expect(output.getByText(/Line one\./)).toBeInTheDocument();
    expect(output.getByText(/<b>not html<\/b>/)).toBeInTheDocument();
    expect(output.queryByText('not html', { selector: 'b' })).not.toBeInTheDocument();
    expect(output.getByText(/Created by mock-large \(Anthropic \(Claude\)\)/)).toBeInTheDocument();
    expect(output.getByText('Exactly the data shown was sent.')).toBeInTheDocument();
    expect(output.getByRole('note')).toHaveTextContent(/not medical advice/);
  });

  it('flags when the data changed since the preview', async () => {
    mockAi(readySettings);
    server.use(
      http.post('/api/ai/preview', () => HttpResponse.json(preview)),
      http.post('/api/ai/analyze', () =>
        HttpResponse.json({ ...result, payloadHash: 'b'.repeat(64) }),
      ),
    );
    renderApp('/ai');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Show data to be sent' }));
    await screen.findByRole('region', { name: 'This data will be sent' });
    await user.click(screen.getByRole('button', { name: 'Start AI analysis' }));
    expect(await screen.findByText('The data changed since the preview.')).toBeInTheDocument();
  });

  it.each([
    ['ai_refused', 'The provider declined to answer.'],
    ['ai_rate_limited', 'The provider limit was reached. Please try again later.'],
    ['provider_unreachable', 'The provider could not be reached.'],
    ['consent_required', 'Your consent is required for this.'],
    ['key_unreadable', 'The stored key can no longer be read. Please enter it again.'],
  ])('translates the error %s', async (code, message) => {
    mockAi(readySettings);
    server.use(
      http.post('/api/ai/analyze', () =>
        HttpResponse.json({ error: { code, message: '' } }, { status: 422 }),
      ),
    );
    renderApp('/ai');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Start AI analysis' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('drops an outdated preview when the settings change', async () => {
    mockAi(readySettings);
    server.use(http.post('/api/ai/preview', () => HttpResponse.json(preview)));
    renderApp('/ai');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Show data to be sent' }));
    await screen.findByRole('region', { name: 'This data will be sent' });
    await user.selectOptions(screen.getByLabelText('Time window after eating'), '12');
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'This data will be sent' }),
      ).not.toBeInTheDocument(),
    );
  });
});

describe('analysis page link', () => {
  it('links to the AI page with the current settings when the feature is on', async () => {
    mockLoggedIn(withAi);
    server.use(
      http.get('/api/analysis', () =>
        HttpResponse.json({
          period: { from: '2026-01-01', to: '2026-01-30', days: 30 },
          window: 24,
          outcome: 'bloating',
          minSeverity: 5,
          summary: {
            entryCounts: { meal: 0, drink: 0, symptom: 0, stool: 0, medication: 0 },
            daysWithEntries: 0,
            foodEntries: 0,
            outcomeEvents: 0,
            censoredFoodEntries: 0,
          },
          topIngredients: [],
          symptomsByDay: [],
          bristolDistribution: [0, 0, 0, 0, 0, 0, 0],
          symptomHeatmap: Array.from({ length: 7 }, () => new Array<number>(24).fill(0)),
          suspects: { ingredients: [], allergens: [] },
          context: [],
          minExposures: 5,
          minOutcomes: 3,
        }),
      ),
    );
    renderApp('/analysis?from=2026-01-01&to=2026-01-30&window=24&outcome=bloating&minSeverity=5');
    const link = await screen.findByRole('link', { name: 'AI analysis' });
    const query = new URLSearchParams(link.getAttribute('href')!.split('?')[1]);
    expect(link.getAttribute('href')).toContain('/ai?');
    expect(query.get('window')).toBe('24');
    expect(query.get('outcome')).toBe('bloating');
  });
});
