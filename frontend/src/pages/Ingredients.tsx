import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Allergen, CustomIngredientDto } from '@foodlog/shared';
import {
  useCatalogIngredients,
  useCreateIngredient,
  useDeleteIngredient,
  useMyIngredients,
  useUpdateIngredient,
} from '../api/hooks.ts';
import { AllergenCheckboxes } from '../components/AllergenCheckboxes.tsx';
import { AllergenChips } from '../components/AllergenChips.tsx';
import { Button, Card, ErrorMessage, Field } from '../components/ui.tsx';
import { ingredientName } from '../lib/format.ts';

function CreateCard() {
  const { t } = useTranslation();
  const create = useCreateIngredient();
  const [name, setName] = useState('');
  const [allergens, setAllergens] = useState<Allergen[]>([]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(
      { name: name.trim(), allergens },
      {
        onSuccess: () => {
          setName('');
          setAllergens([]);
        },
      },
    );
  };

  return (
    <Card title={t('ingredientsPage.createTitle')}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorMessage error={create.error} />
        <Field
          label={t('ingredientsPage.name')}
          required
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t('ingredientsPage.containsLabel')}</legend>
          <AllergenCheckboxes value={allergens} onChange={setAllergens} />
        </fieldset>
        <Button type="submit" disabled={create.isPending}>
          {t('ingredientsPage.create')}
        </Button>
      </form>
    </Card>
  );
}

function CustomRow({ ingredient }: { ingredient: CustomIngredientDto }) {
  const { t, i18n } = useTranslation();
  const update = useUpdateIngredient();
  const remove = useDeleteIngredient();
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view');
  const [name, setName] = useState(ingredient.nameDe);
  const [allergens, setAllergens] = useState<Allergen[]>(ingredient.allergens);
  const label = ingredientName(ingredient, i18n.language);

  const save = (event: FormEvent) => {
    event.preventDefault();
    update.mutate(
      { id: ingredient.id, body: { name: name.trim(), allergens } },
      { onSuccess: () => setMode('view') },
    );
  };

  if (mode === 'edit') {
    return (
      <li className="space-y-3 py-4">
        <form onSubmit={save} className="space-y-3">
          <ErrorMessage error={update.error} />
          <Field
            label={t('ingredientsPage.editName', { name: label })}
            required
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t('ingredientsPage.containsLabel')}</legend>
            <AllergenCheckboxes value={allergens} onChange={setAllergens} />
          </fieldset>
          <div className="flex gap-3">
            <Button type="submit" disabled={update.isPending}>
              {t('ingredientsPage.save')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setName(ingredient.nameDe);
                setAllergens(ingredient.allergens);
                update.reset();
                setMode('view');
              }}
            >
              {t('ingredientsPage.cancel')}
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="space-y-2 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{label}</span>
        <span className="text-sm text-fg/75">
          {t('ingredientsPage.usedIn', { count: ingredient.entryCount })}
        </span>
      </div>
      {ingredient.allergens.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          <AllergenChips allergens={ingredient.allergens} />
        </div>
      ) : (
        <p className="text-sm text-fg/75">{t('ingredientsPage.noAllergens')}</p>
      )}
      <ErrorMessage error={remove.error} />
      {mode === 'delete' ? (
        <div className="space-y-2 text-sm">
          <p>
            {ingredient.entryCount > 0
              ? t('ingredientsPage.confirmDelete', { name: label, count: ingredient.entryCount })
              : t('ingredientsPage.confirmDeleteUnused', { name: label })}
          </p>
          <div className="flex gap-3">
            <Button
              type="button"
              onClick={() => remove.mutate(ingredient.id)}
              disabled={remove.isPending}
              className="px-3 py-1"
            >
              {t('ingredientsPage.delete')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setMode('view')}
              className="px-3 py-1"
            >
              {t('ingredientsPage.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-3 text-sm">
          <button
            type="button"
            onClick={() => setMode('edit')}
            aria-label={`${t('ingredientsPage.edit')} ${label}`}
            className="font-medium text-accent hover:underline"
          >
            {t('ingredientsPage.edit')}
          </button>
          <button
            type="button"
            onClick={() => setMode('delete')}
            aria-label={`${t('ingredientsPage.delete')} ${label}`}
            className="font-medium text-accent hover:underline"
          >
            {t('ingredientsPage.delete')}
          </button>
        </div>
      )}
    </li>
  );
}

function CustomList() {
  const { t } = useTranslation();
  const mine = useMyIngredients();
  return (
    <Card title={t('ingredientsPage.myTitle')}>
      <ErrorMessage error={mine.error} />
      {mine.data?.length === 0 && <p className="text-fg/75">{t('ingredientsPage.empty')}</p>}
      <ul className="divide-y divide-fg/10">
        {mine.data?.map((ingredient) => (
          <CustomRow key={ingredient.id} ingredient={ingredient} />
        ))}
      </ul>
    </Card>
  );
}

function CatalogCard() {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const results = useCatalogIngredients(query.trim());
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = results;
  const sentinel = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <Card title={t('ingredientsPage.catalogTitle')}>
      <p className="text-sm text-fg/75">{t('ingredientsPage.catalogHint')}</p>
      <Field
        label={t('ingredientsPage.catalogSearch')}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <ul className="divide-y divide-fg/10">
        {results.data?.pages.flat().map((ingredient) => (
          <li key={ingredient.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
            <span className="font-medium">{ingredientName(ingredient, i18n.language)}</span>
            <AllergenChips allergens={ingredient.allergens} />
          </li>
        ))}
        {hasNextPage && <li ref={sentinel} aria-hidden className="h-1" />}
      </ul>
    </Card>
  );
}

export function IngredientsPage() {
  const { t } = useTranslation();
  return (
    <>
      <h1 className="text-2xl font-bold">{t('ingredientsPage.title')}</h1>
      <CreateCard />
      <CustomList />
      <CatalogCard />
    </>
  );
}
