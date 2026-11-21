import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { AnalysisDto, IngredientDto, SuspectDto } from '@foodlog/shared';
import { server } from '../test/server.ts';
import { mockLoggedIn, renderApp } from '../test/render.tsx';

const milk: IngredientDto = {
  id: '11111111-1111-4111-8111-111111111111',
  nameDe: 'Milch',
  nameEn: 'Milk',
  custom: false,
  allergens: ['lactose', 'milk_protein'],
};

const milkSuspect: SuspectDto = {
  key: milk.id,
  ingredient: milk,
  allergen: null,
  exposures: 12,
  exposuresWithOutcome: 9,
  rateExposed: 0.75,
  rateUnexposed: 0.1,
  relativeRisk: 7.5,
  ciLow: 2.4,
  ciHigh: 23.1,
  confidence: 'high',
  medianLagMinutes: 135,
  lagHistogram: [0, 3, 5, 1, 0, 0],
  alsoWith: [
    { id: 'oats', nameDe: 'Haferflocken', nameEn: 'Oats', custom: false, allergens: ['gluten'] },
  ],
};

const lactoseSuspect: SuspectDto = {
  ...milkSuspect,
  key: 'lactose',
  ingredient: null,
  allergen: 'lactose',
  confidence: 'medium',
  medianLagMinutes: 45,
  alsoWith: [],
};

function analysis(overrides: Partial<AnalysisDto> = {}): AnalysisDto {
  return {
    period: { from: '2026-01-01', to: '2026-01-30', days: 30 },
    window: 8,
    outcome: 'symptoms',
    minSeverity: 3,
    summary: {
      entryCounts: { meal: 40, drink: 20, symptom: 12, stool: 25, medication: 1 },
      daysWithEntries: 28,
      foodEntries: 60,
      outcomeEvents: 12,
      censoredFoodEntries: 2,
    },
    topIngredients: [{ ingredient: milk, count: 14 }],
    symptomsByDay: [{ date: '2026-01-01', count: 1, maxSeverity: 5 }],
    bristolDistribution: [0, 1, 3, 10, 5, 4, 2],
    symptomHeatmap: Array.from({ length: 7 }, () => new Array<number>(24).fill(0)),
    suspects: { ingredients: [milkSuspect], allergens: [lactoseSuspect] },
    minExposures: 5,
    minOutcomes: 3,
    ...overrides,
  };
}

function mockAnalysis(data: AnalysisDto = analysis()) {
  mockLoggedIn();
  const requests: URLSearchParams[] = [];
  server.use(
    http.get('/api/analysis', ({ request }) => {
      requests.push(new URL(request.url).searchParams);
      return HttpResponse.json(data);
    }),
  );
  return requests;
}

describe('analysis page', () => {
  it('shows the disclaimer, summary and suspects', async () => {
    mockAnalysis();
    renderApp('/analysis');
    expect(await screen.findByRole('note')).toHaveTextContent(/not a diagnosis/);

    const summary = within(await screen.findByRole('region', { name: 'Entries' }));
    expect(summary.getByText('98')).toBeInTheDocument();
    expect(summary.getByText('28')).toBeInTheDocument();
    expect(screen.getByText('2 entries are too recent to be evaluated.')).toBeInTheDocument();

    const ingredients = within(
      screen.getByRole('table', { name: 'Possible intolerances: By ingredient' }),
    );
    expect(ingredients.getByRole('rowheader', { name: /^Milk/ })).toBeInTheDocument();
    expect(ingredients.getByText('9 (75 %)')).toBeInTheDocument();
    expect(ingredients.getByText('10 %')).toBeInTheDocument();
    expect(ingredients.getByText('7.5×')).toBeInTheDocument();
    expect(ingredients.getByText('2.4–23')).toBeInTheDocument();
    expect(ingredients.getByText('always eaten together with Oats')).toBeInTheDocument();
    expect(ingredients.getByText('high')).toBeInTheDocument();
    expect(ingredients.getByText('2 h 15 min')).toBeInTheDocument();

    const allergens = within(
      screen.getByRole('table', { name: 'Possible intolerances: By category' }),
    );
    expect(allergens.getByRole('rowheader', { name: 'Lactose' })).toBeInTheDocument();
    expect(allergens.getByText('45 min')).toBeInTheDocument();
    expect(allergens.getByText('medium')).toBeInTheDocument();
  });

  it('requests the default period, window and outcome', async () => {
    const requests = mockAnalysis();
    renderApp('/analysis');
    await screen.findByRole('note');
    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    const query = requests[0]!;
    expect(query.get('window')).toBe('8');
    expect(query.get('outcome')).toBe('symptoms');
    expect(query.get('minSeverity')).toBe('3');
    expect(query.get('from')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('reads settings from the URL and refetches when they change', async () => {
    const requests = mockAnalysis();
    renderApp('/analysis?from=2026-01-01&to=2026-01-30&window=24&outcome=bloating&minSeverity=5');
    await screen.findByRole('note');
    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    expect(requests[0]!.get('window')).toBe('24');
    expect(requests[0]!.get('outcome')).toBe('bloating');
    expect(requests[0]!.get('minSeverity')).toBe('5');

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Time window after eating'), '12');
    await waitFor(() => expect(requests.some((query) => query.get('window') === '12')).toBe(true));
    await user.selectOptions(screen.getByLabelText('Complaint'), 'stool');
    await waitFor(() =>
      expect(requests.some((query) => query.get('outcome') === 'stool')).toBe(true),
    );
    expect(screen.getByLabelText('Minimum severity')).toBeDisabled();
  });

  it('applies period presets', async () => {
    const requests = mockAnalysis();
    renderApp('/analysis');
    await screen.findByRole('note');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '90 days' }));
    await waitFor(() => {
      const last = requests.at(-1)!;
      const days =
        (Date.parse(`${last.get('to')}T00:00:00Z`) - Date.parse(`${last.get('from')}T00:00:00Z`)) /
          86_400_000 +
        1;
      expect(days).toBe(90);
    });
    expect(screen.getByRole('button', { name: '90 days' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('explains when there is not enough data', async () => {
    mockAnalysis(
      analysis({
        summary: {
          entryCounts: { meal: 2, drink: 0, symptom: 0, stool: 0, medication: 0 },
          daysWithEntries: 2,
          foodEntries: 2,
          outcomeEvents: 0,
          censoredFoodEntries: 0,
        },
        suspects: { ingredients: [], allergens: [] },
      }),
    );
    renderApp('/analysis');
    expect(await screen.findByText(/More data is needed for reliable results/)).toBeInTheDocument();
    expect(screen.getAllByText('No findings with enough data.')).toHaveLength(2);
  });

  it('shows API errors', async () => {
    mockLoggedIn();
    server.use(
      http.get('/api/analysis', () =>
        HttpResponse.json({ error: { code: 'validation_error', message: '' } }, { status: 400 }),
      ),
    );
    renderApp('/analysis');
    expect(await screen.findByRole('alert')).toHaveTextContent('Please check your input.');
  });
});
