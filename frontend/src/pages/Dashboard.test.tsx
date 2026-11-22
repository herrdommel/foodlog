import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import {
  todayInTimeZone,
  shiftDate,
  type EntryDto,
  type IngredientDto,
  type TemplateDto,
} from '@foodlog/shared';
import { server } from '../test/server.ts';
import { meResponse, mockLoggedIn, renderApp } from '../test/render.tsx';

const milk: IngredientDto = {
  id: '11111111-1111-4111-8111-111111111111',
  nameDe: 'Milch',
  nameEn: 'Milk',
  custom: false,
  allergens: ['lactose', 'milk_protein'],
};
const oats: IngredientDto = {
  id: '22222222-2222-4222-8222-222222222222',
  nameDe: 'Haferflocken',
  nameEn: 'Oats',
  custom: false,
  allergens: ['gluten'],
};

const meal: EntryDto = {
  id: 'e1',
  type: 'meal',
  occurredAt: '2026-01-10T07:30:00.000Z',
  title: 'Breakfast bowl',
  note: 'tasty',
  symptomType: null,
  severity: null,
  bristol: null,
  sleepMinutes: null,
  rating: null,
  ingredients: [oats, milk],
};
const symptom: EntryDto = {
  id: 'e2',
  type: 'symptom',
  occurredAt: '2026-01-10T09:30:00.000Z',
  title: null,
  note: null,
  symptomType: 'bloating',
  severity: 6,
  bristol: null,
  sleepMinutes: null,
  rating: null,
  ingredients: [],
};
const stool: EntryDto = {
  id: 'e3',
  type: 'stool',
  occurredAt: '2026-01-10T10:30:00.000Z',
  title: null,
  note: null,
  symptomType: null,
  severity: null,
  bristol: 4,
  sleepMinutes: null,
  rating: null,
  ingredients: [],
};

const timezone = meResponse.user.timezone;
const today = todayInTimeZone(timezone);

function mockCommon(options: { entries?: EntryDto[]; templates?: TemplateDto[] } = {}) {
  mockLoggedIn();
  const requestedDates: string[] = [];
  server.use(
    http.get('/api/entries', ({ request }) => {
      requestedDates.push(new URL(request.url).searchParams.get('date') ?? '');
      return HttpResponse.json(options.entries ?? []);
    }),
    http.get('/api/templates', () => HttpResponse.json(options.templates ?? [])),
    http.get('/api/ingredients', ({ request }) => {
      const q = (new URL(request.url).searchParams.get('q') ?? '').toLowerCase();
      const all = [milk, oats];
      return HttpResponse.json(
        all.filter(
          (item) => item.nameEn.toLowerCase().includes(q) || item.nameDe.toLowerCase().includes(q),
        ),
      );
    }),
  );
  return requestedDates;
}

describe('dashboard', () => {
  it('lists the entries of the day with details', async () => {
    mockCommon({ entries: [meal, symptom, stool] });
    renderApp('/');
    expect(await screen.findByText('Breakfast bowl')).toBeInTheDocument();
    expect(screen.getByText('Milk, Oats')).toBeInTheDocument();
    expect(screen.getByText('Lactose')).toBeInTheDocument();
    expect(screen.getByText('Gluten')).toBeInTheDocument();
    expect(screen.getByText('tasty')).toBeInTheDocument();
    expect(screen.getByText('Bloating')).toBeInTheDocument();
    expect(screen.getByText('6 out of 10')).toBeInTheDocument();
    expect(screen.getByText('Type 4')).toBeInTheDocument();
  });

  it('lists sleep and stress entries', async () => {
    const sleep: EntryDto = {
      ...meal,
      id: 's1',
      type: 'sleep',
      title: null,
      note: null,
      ingredients: [],
      sleepMinutes: 450,
      rating: 4,
    };
    const stress: EntryDto = { ...sleep, id: 's2', type: 'stress', sleepMinutes: null, rating: 5 };
    mockCommon({ entries: [sleep, stress] });
    renderApp('/');
    expect(await screen.findByText('7 h 30 min')).toBeInTheDocument();
    expect(screen.getByText('good')).toBeInTheDocument();
    expect(screen.getByText('very stressed')).toBeInTheDocument();
    expect(screen.getByText('Level 5 of 5')).toBeInTheDocument();
  });

  it('creates a sleep entry from hours and a quality rating', async () => {
    mockCommon();
    let body: Record<string, unknown> = {};
    server.use(
      http.post('/api/entries', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(meal, { status: 201 });
      }),
    );
    renderApp('/');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Sleep' }));
    const hours = screen.getByLabelText('Sleep duration (hours)');
    await user.clear(hours);
    await user.type(hours, '6.5');
    await user.click(screen.getByRole('radio', { name: /^2: bad/ }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(body).toMatchObject({ type: 'sleep', sleepMinutes: 390, rating: 2 }),
    );
  });

  it('creates a stress entry with the default level', async () => {
    mockCommon();
    let body: Record<string, unknown> = {};
    server.use(
      http.post('/api/entries', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(meal, { status: 201 });
      }),
    );
    renderApp('/');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Stress' }));
    await user.click(screen.getByRole('radio', { name: /^4: stressed/ }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(body).toMatchObject({ type: 'stress', rating: 4 }));
  });

  it('hides sleep and stress when the feature is off', async () => {
    mockCommon();
    mockLoggedIn({ ...meResponse, features: { ...meResponse.features, context_factors: false } });
    renderApp('/');
    await screen.findByRole('button', { name: 'Meal' });
    expect(screen.queryByRole('button', { name: 'Sleep' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stress' })).not.toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    mockCommon();
    renderApp('/');
    expect(await screen.findByText('There are no entries for this day yet.')).toBeInTheDocument();
  });

  it('navigates between days and cannot go beyond today', async () => {
    const dates = mockCommon();
    renderApp('/');
    const user = userEvent.setup();
    const next = await screen.findByRole('button', { name: 'Next day' });
    expect(next).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Previous day' }));
    await waitFor(() => expect(dates).toContain(shiftDate(today, -1)));
    expect(screen.getByRole('button', { name: 'Next day' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Go to today' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled());
  });

  it('creates a meal with ingredients', async () => {
    mockCommon();
    let body: Record<string, unknown> = {};
    server.use(
      http.post('/api/entries', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(meal, { status: 201 });
      }),
    );
    renderApp('/');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Meal' }));
    await user.type(screen.getByLabelText('Title (optional)'), 'Müsli');
    await user.type(screen.getByLabelText('Ingredients'), 'milk');
    await user.click(await screen.findByRole('button', { name: /Milk/ }));
    expect(screen.getByRole('button', { name: 'Remove Milk' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(body.type).toBe('meal'));
    expect(body).toMatchObject({ title: 'Müsli', ingredientIds: [milk.id] });
    expect(String(body.occurredAt)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    await waitFor(() => expect(screen.queryByRole('form')).not.toBeInTheDocument());
  });

  it('creates a custom ingredient with allergens', async () => {
    mockCommon();
    let created: unknown;
    const custom: IngredientDto = {
      id: '33333333-3333-4333-8333-333333333333',
      nameDe: 'Omas Suppe',
      nameEn: 'Omas Suppe',
      custom: true,
      allergens: ['celery'],
    };
    server.use(
      http.post('/api/ingredients', async ({ request }) => {
        created = await request.json();
        return HttpResponse.json(custom, { status: 201 });
      }),
    );
    renderApp('/');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Meal' }));
    await user.type(screen.getByLabelText('Ingredients'), 'Omas Suppe');
    await user.click(await screen.findByRole('button', { name: 'Create “Omas Suppe”' }));
    await user.click(screen.getByRole('checkbox', { name: 'Celery' }));
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByRole('button', { name: 'Remove Omas Suppe' })).toBeInTheDocument();
    expect(created).toEqual({ name: 'Omas Suppe', allergens: ['celery'] });
  });

  it('creates a symptom with severity', async () => {
    mockCommon();
    let body: Record<string, unknown> = {};
    server.use(
      http.post('/api/entries', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(symptom, { status: 201 });
      }),
    );
    renderApp('/');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Symptom' }));
    await user.selectOptions(screen.getByLabelText('Type of symptom'), 'nausea');
    fireEvent.change(screen.getByLabelText('Severity'), { target: { value: '8' } });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(body.type).toBe('symptom'));
    expect(body).toMatchObject({ symptomType: 'nausea', severity: 8 });
  });

  it('creates a stool entry with the bristol type', async () => {
    mockCommon();
    let body: Record<string, unknown> = {};
    server.use(
      http.post('/api/entries', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(stool, { status: 201 });
      }),
    );
    renderApp('/');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Stool' }));
    await user.click(screen.getByRole('radio', { name: /Type 6/ }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(body.type).toBe('stool'));
    expect(body).toMatchObject({ bristol: 6 });
  });

  it('shows API errors in the form', async () => {
    mockCommon();
    server.use(
      http.post('/api/entries', () =>
        HttpResponse.json({ error: { code: 'future_time', message: '' } }, { status: 400 }),
      ),
    );
    renderApp('/');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Stool' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Entries in the future are not possible.',
    );
  });

  it('edits an existing entry', async () => {
    mockCommon({ entries: [symptom] });
    let request: { url: string; body: Record<string, unknown> } | undefined;
    server.use(
      http.put('/api/entries/:id', async ({ request: r }) => {
        request = { url: r.url, body: (await r.json()) as Record<string, unknown> };
        return HttpResponse.json(symptom);
      }),
    );
    renderApp('/');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Severity'), { target: { value: '2' } });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(request).toBeDefined());
    expect(request?.url).toContain('/api/entries/e2');
    expect(request?.body).toMatchObject({ type: 'symptom', symptomType: 'bloating', severity: 2 });
    expect(String(request?.body.occurredAt)).toBe('2026-01-10T10:30');
  });

  it('deletes an entry after confirmation', async () => {
    mockCommon({ entries: [stool] });
    let deleted = false;
    server.use(
      http.delete('/api/entries/:id', () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp('/');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(screen.getByText('Really delete?')).toBeInTheDocument();
    expect(deleted).toBe(false);
    await user.click(within(screen.getByRole('listitem')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleted).toBe(true));
  });

  it('applies a template and can save a new one', async () => {
    const template: TemplateDto = {
      id: 't1',
      name: 'Usual breakfast',
      type: 'meal',
      title: 'Oat bowl',
      ingredients: [oats, milk],
    };
    mockCommon({ templates: [template] });
    let templateBody: unknown;
    server.use(
      http.post('/api/entries', () => HttpResponse.json(meal, { status: 201 })),
      http.post('/api/templates', async ({ request }) => {
        templateBody = await request.json();
        return HttpResponse.json(template, { status: 201 });
      }),
    );
    renderApp('/');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Meal' }));
    await user.click(await screen.findByRole('button', { name: 'Use template Usual breakfast' }));
    expect(screen.getByLabelText('Title (optional)')).toHaveValue('Oat bowl');
    expect(screen.getByRole('button', { name: 'Remove Oats' })).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Save as template' }));
    await user.type(screen.getByLabelText('Template name'), 'Weekend bowl');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(templateBody).toBeDefined());
    expect(templateBody).toEqual({
      name: 'Weekend bowl',
      type: 'meal',
      title: 'Oat bowl',
      ingredientIds: [oats.id, milk.id],
    });
  });
});
