import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Allergen, IngredientDto } from '@foodlog/shared';
import { useCreateIngredient, useIngredientSearch } from '../api/hooks.ts';
import { ingredientName } from '../lib/format.ts';
import { AllergenCheckboxes } from './AllergenCheckboxes.tsx';
import { AllergenChips } from './AllergenChips.tsx';
import { Button, ErrorMessage } from './ui.tsx';

function useDebounced(value: string, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function IngredientPicker({
  selected,
  onChange,
}: {
  selected: IngredientDto[];
  onChange: (ingredients: IngredientDto[]) => void;
}) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [allergens, setAllergens] = useState<Allergen[]>([]);
  const debounced = useDebounced(query.trim());
  const search = useIngredientSearch(debounced);
  const create = useCreateIngredient();

  const name = (ingredient: IngredientDto) => ingredientName(ingredient, i18n.language);
  const selectedIds = new Set(selected.map((ingredient) => ingredient.id));
  const trimmed = query.trim();
  const results = trimmed && debounced === trimmed ? (search.data ?? []) : [];
  const available = results.filter((ingredient) => !selectedIds.has(ingredient.id));
  const exactMatch = results.some(
    (ingredient) =>
      ingredient.nameDe.toLowerCase() === trimmed.toLowerCase() ||
      ingredient.nameEn.toLowerCase() === trimmed.toLowerCase(),
  );
  const canCreate = trimmed !== '' && debounced === trimmed && !search.isFetching && !exactMatch;

  const add = (ingredient: IngredientDto) => {
    onChange([...selected, ingredient]);
    setQuery('');
    setCreating(false);
    setAllergens([]);
  };

  const submitCreate = () => {
    create.mutate({ name: trimmed, allergens }, { onSuccess: add });
  };

  return (
    <div className="space-y-2">
      <label htmlFor="ingredient-search" className="block text-sm font-medium">
        {t('tracking.ingredients')}
      </label>
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {selected.map((ingredient) => (
            <li
              key={ingredient.id}
              className="flex items-center gap-1 rounded-full bg-accent/20 py-1 pl-3 pr-1 text-sm"
            >
              {name(ingredient)}
              <button
                type="button"
                aria-label={t('tracking.removeIngredient', { name: name(ingredient) })}
                onClick={() => onChange(selected.filter((item) => item.id !== ingredient.id))}
                className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-fg/10"
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        id="ingredient-search"
        type="search"
        autoComplete="off"
        placeholder={t('tracking.searchIngredients')}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setCreating(false);
          create.reset();
        }}
        className="w-full rounded-lg border border-fg/20 bg-raised px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
      />
      {trimmed && (
        <ul className="divide-y divide-fg/10 rounded-lg border border-fg/10 bg-raised">
          {available.map((ingredient) => (
            <li key={ingredient.id}>
              <button
                type="button"
                onClick={() => add(ingredient)}
                className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-sm hover:bg-fg/5"
              >
                <span className="font-medium">{name(ingredient)}</span>
                {ingredient.custom && (
                  <span className="text-xs text-fg/75">{t('tracking.customTag')}</span>
                )}
                <AllergenChips allergens={ingredient.allergens} />
              </button>
            </li>
          ))}
          {canCreate && !creating && (
            <li>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="w-full px-3 py-2 text-left text-sm font-medium text-accent hover:bg-fg/5"
              >
                {t('tracking.createTag', { name: trimmed })}
              </button>
            </li>
          )}
          {available.length === 0 && !canCreate && debounced === trimmed && !search.isFetching && (
            <li className="px-3 py-2 text-sm text-fg/75">{t('tracking.noResults')}</li>
          )}
        </ul>
      )}
      {creating && (
        <fieldset className="space-y-3 rounded-lg border border-fg/10 p-3">
          <legend className="px-1 text-sm font-medium">{t('tracking.createTagAllergens')}</legend>
          <ErrorMessage error={create.error} />
          <AllergenCheckboxes value={allergens} onChange={setAllergens} />
          <Button type="button" onClick={submitCreate} disabled={create.isPending}>
            {t('tracking.addTag')}
          </Button>
        </fieldset>
      )}
    </div>
  );
}
