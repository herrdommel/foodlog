import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { CustomIngredientDto, IngredientDto } from '@foodlog/shared';
import { server } from '../test/server.ts';
import { mockLoggedIn, renderApp } from '../test/render.tsx';

const soup: CustomIngredientDto = {
  id: '33333333-3333-4333-8333-333333333333',
  names: { und: 'Omas Suppe' },
  custom: true,
  allergens: ['celery'],
  entryCount: 3,
};
const plain: CustomIngredientDto = {
  id: '44444444-4444-4444-8444-444444444444',
  names: { und: 'Mein Tag' },
  custom: true,
  allergens: [],
  entryCount: 0,
};
const milk: IngredientDto = {
  id: '11111111-1111-4111-8111-111111111111',
  names: { de: 'Milch', en: 'Milk' },
  custom: false,
  allergens: ['lactose', 'milk_protein'],
};

function mockPage(mine: CustomIngredientDto[] = [soup, plain]) {
  mockLoggedIn();
  server.use(
    http.get('/api/ingredients/mine', () => HttpResponse.json(mine)),
    http.get('/api/ingredients', ({ request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.get('scope')).toBe('catalog');
      return HttpResponse.json([milk]);
    }),
  );
}

describe('ingredients page', () => {
  it('lists own ingredients with usage and flags missing allergens', async () => {
    mockPage();
    renderApp('/ingredients');
    const mine = within(await screen.findByRole('region', { name: 'My ingredients' }));
    expect(await mine.findByText('Omas Suppe')).toBeInTheDocument();
    expect(mine.getByText('used in 3 entries')).toBeInTheDocument();
    expect(mine.getByText('Celery')).toBeInTheDocument();
    expect(mine.getByText('used in 0 entries')).toBeInTheDocument();
    expect(
      mine.getByText('No allergens assigned: not analysed at allergen level.'),
    ).toBeInTheDocument();
  });

  it('shows the read-only catalog', async () => {
    mockPage();
    renderApp('/ingredients');
    const catalog = within(await screen.findByRole('region', { name: 'Catalog' }));
    expect(await catalog.findByText('Milk')).toBeInTheDocument();
    expect(catalog.getByText('Lactose')).toBeInTheDocument();
  });

  it('creates an ingredient with allergens', async () => {
    mockPage([]);
    let body: unknown;
    server.use(
      http.post('/api/ingredients', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(soup, { status: 201 });
      }),
    );
    renderApp('/ingredients');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Name'), 'Omas Suppe');
    await user.click(screen.getByRole('checkbox', { name: 'Celery' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(body).toEqual({ name: 'Omas Suppe', allergens: ['celery'] }));
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue(''));
  });

  it('shows an error when the name exists', async () => {
    mockPage([]);
    server.use(
      http.post('/api/ingredients', () =>
        HttpResponse.json({ error: { code: 'ingredient_exists', message: '' } }, { status: 409 }),
      ),
    );
    renderApp('/ingredients');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Name'), 'Milch');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This ingredient already exists.');
  });

  it('edits name and allergens', async () => {
    mockPage();
    let request: { url: string; body: unknown } | undefined;
    server.use(
      http.patch('/api/ingredients/:id', async ({ request: r }) => {
        request = { url: r.url, body: await r.json() };
        return HttpResponse.json(soup);
      }),
    );
    renderApp('/ingredients');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Edit Omas Suppe' }));
    const mine = within(screen.getByRole('region', { name: 'My ingredients' }));
    const nameField = mine.getByLabelText('Name of Omas Suppe');
    await user.clear(nameField);
    await user.type(nameField, 'Omas Eintopf');
    await user.click(mine.getByRole('checkbox', { name: 'Gluten' }));
    await user.click(mine.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(request).toBeDefined());
    expect(request?.url).toContain(`/api/ingredients/${soup.id}`);
    expect(request?.body).toEqual({ name: 'Omas Eintopf', allergens: ['celery', 'gluten'] });
  });

  it('warns about affected entries before deleting', async () => {
    mockPage();
    let deleted: string | undefined;
    server.use(
      http.delete('/api/ingredients/:id', ({ params }) => {
        deleted = String(params.id);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp('/ingredients');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Delete Omas Suppe' }));
    expect(screen.getByText(/It is used in 3 entries/)).toBeInTheDocument();
    expect(deleted).toBeUndefined();
    const row = screen.getByText(/It is used in 3 entries/).closest('li')!;
    await user.click(within(row).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleted).toBe(soup.id));
  });

  it('uses a short confirmation for unused ingredients', async () => {
    mockPage();
    renderApp('/ingredients');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Delete Mein Tag' }));
    expect(screen.getByText('Delete “Mein Tag”?')).toBeInTheDocument();
  });
});
