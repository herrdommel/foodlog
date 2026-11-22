import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { IngredientDto, IngredientSuggestionsDto } from '@foodlog/shared';
import { useCreateIngredient } from '../api/hooks.ts';
import { ingredientName } from '../lib/format.ts';
import { AllergenChips } from './AllergenChips.tsx';
import { ActionRow, Button, ErrorMessage } from './ui.tsx';

export function IngredientSuggestions({
  suggestions,
  onAdd,
  onCancel,
}: {
  suggestions: IngredientSuggestionsDto;
  onAdd: (ingredients: IngredientDto[]) => void;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  const create = useCreateIngredient();
  const [matched, setMatched] = useState(() => new Set(suggestions.matched.map((i) => i.id)));
  const [proposed, setProposed] = useState(() => new Set(suggestions.proposed.map((p) => p.name)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const toggle = (set: Set<string>, update: (next: Set<string>) => void, key: string) => {
    const next = new Set(set);
    if (!next.delete(key)) next.add(key);
    update(next);
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const created: IngredientDto[] = [];
      for (const item of suggestions.proposed.filter((p) => proposed.has(p.name))) {
        created.push(await create.mutateAsync({ name: item.name, allergens: item.allergens }));
      }
      onAdd([...suggestions.matched.filter((i) => matched.has(i.id)), ...created]);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  const count = matched.size + proposed.size;
  const empty = suggestions.matched.length === 0 && suggestions.proposed.length === 0;

  return (
    <div className="space-y-3">
      <ErrorMessage error={error} />
      {empty && <p className="text-sm text-fg/75">{t('suggestions.none')}</p>}
      {suggestions.matched.length > 0 && (
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium">{t('suggestions.known')}</legend>
          {suggestions.matched.map((ingredient) => (
            <label key={ingredient.id} className="flex flex-wrap items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={matched.has(ingredient.id)}
                onChange={() => toggle(matched, setMatched, ingredient.id)}
              />
              <span>{ingredientName(ingredient, i18n.language)}</span>
              <AllergenChips allergens={ingredient.allergens} />
            </label>
          ))}
        </fieldset>
      )}
      {suggestions.proposed.length > 0 && (
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium">{t('suggestions.new')}</legend>
          <p className="text-sm text-fg/75">{t('suggestions.newHint')}</p>
          {suggestions.proposed.map((item) => (
            <label key={item.name} className="flex flex-wrap items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={proposed.has(item.name)}
                onChange={() => toggle(proposed, setProposed, item.name)}
              />
              <span>{item.name}</span>
              {item.source === 'product' && (
                <span className="text-fg/75">({t('suggestions.productLevel')})</span>
              )}
              <AllergenChips allergens={item.allergens} />
            </label>
          ))}
        </fieldset>
      )}
      <ActionRow columns={2}>
        <Button type="button" disabled={busy || count === 0} onClick={confirm}>
          {t('suggestions.add', { count })}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('tracking.cancel')}
        </Button>
      </ActionRow>
    </div>
  );
}
