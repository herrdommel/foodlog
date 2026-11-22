import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisDto } from '@foodlog/shared';
import { server } from '../test/server.ts';
import { mockLoggedIn, renderApp } from '../test/render.tsx';

const data: AnalysisDto = {
  period: { from: '2026-01-01', to: '2026-01-30', days: 30 },
  window: 12,
  outcome: 'bloating',
  minSeverity: 3,
  summary: {
    entryCounts: { meal: 10, drink: 5, symptom: 4, stool: 6, medication: 0, sleep: 0, stress: 0 },
    daysWithEntries: 20,
    foodEntries: 15,
    outcomeEvents: 4,
    censoredFoodEntries: 0,
  },
  topIngredients: [],
  symptomsByDay: [{ date: '2026-01-01', count: 1, maxSeverity: 5 }],
  bristolDistribution: [0, 0, 1, 3, 1, 1, 0],
  symptomHeatmap: Array.from({ length: 7 }, () => new Array<number>(24).fill(0)),
  suspects: {
    ingredients: [],
    allergens: [
      {
        key: 'lactose',
        ingredient: null,
        allergen: 'lactose',
        exposures: 9,
        exposuresWithOutcome: 6,
        rateExposed: 0.67,
        rateUnexposed: 0.17,
        relativeRisk: 3.9,
        ciLow: 1.1,
        ciHigh: 9.4,
        confidence: 'medium',
        medianLagMinutes: 100,
        lagHistogram: [1, 3, 2, 0, 0, 0],
        alsoWith: [],
      },
    ],
  },
  context: [],
  minExposures: 5,
  minOutcomes: 3,
};

afterEach(() => vi.restoreAllMocks());

describe('report page', () => {
  it('renders a printable summary with disclaimer, settings and findings', async () => {
    mockLoggedIn();
    server.use(http.get('/api/analysis', () => HttpResponse.json(data)));
    renderApp('/report?from=2026-01-01&to=2026-01-30&window=12&outcome=bloating&minSeverity=3');

    expect(
      await screen.findByRole('heading', { name: 'Foodlog report', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText('Prepared for Anna')).toBeInTheDocument();
    expect(screen.getByText('Period: 2026-01-01 to 2026-01-30')).toBeInTheDocument();
    expect(screen.getByText('Settings: 12 hour window, Bloating')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/not a diagnosis/);

    const allergens = within(
      await screen.findByRole('table', { name: 'Possible intolerances: By category' }),
    );
    expect(allergens.getByRole('rowheader', { name: 'Lactose' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'How this was calculated' })).toBeInTheDocument();
    expect(screen.getByText(/fewer than 5 meals or 3 complaints/)).toBeInTheDocument();
  });

  it('prints the page', async () => {
    mockLoggedIn();
    server.use(http.get('/api/analysis', () => HttpResponse.json(data)));
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    renderApp('/report?from=2026-01-01&to=2026-01-30');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Print or save as PDF' }));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('links back to the analysis with the same settings', async () => {
    mockLoggedIn();
    server.use(http.get('/api/analysis', () => HttpResponse.json(data)));
    renderApp('/report?from=2026-01-01&to=2026-01-30&window=12&outcome=bloating&minSeverity=3');
    const back = await screen.findByRole('link', { name: 'Back to analysis' });
    expect(back.getAttribute('href')).toContain('/analysis?');
    expect(back.getAttribute('href')).toContain('window=12');
    expect(back.getAttribute('href')).toContain('outcome=bloating');
  });
});
