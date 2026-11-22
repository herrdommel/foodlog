import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EntryDto } from '@foodlog/shared';
import { useDeleteEntry } from '../api/hooks.ts';
import { formatTime, ingredientName } from '../lib/format.ts';
import { AllergenChips } from './AllergenChips.tsx';
import { Button, ErrorMessage } from './ui.tsx';

const typeColors: Record<EntryDto['type'], string> = {
  meal: 'bg-brand text-cream',
  drink: 'bg-accent/30 text-fg',
  symptom: 'bg-coral text-ink',
  stool: 'bg-ink text-cream dark:bg-cream dark:text-ink',
  medication: 'bg-fg/15 text-fg',
  sleep: 'bg-accent/30 text-fg',
  stress: 'bg-coral/40 text-fg',
};

export function EntryCard({
  entry,
  timeZone,
  onEdit,
}: {
  entry: EntryDto;
  timeZone: string;
  onEdit: () => void;
}) {
  const { t, i18n } = useTranslation();
  const remove = useDeleteEntry();
  const [confirming, setConfirming] = useState(false);

  const allergens = [...new Set(entry.ingredients.flatMap((ingredient) => ingredient.allergens))];

  return (
    <li className="space-y-2 rounded-2xl bg-raised p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <time dateTime={entry.occurredAt} className="font-mono text-sm tabular-nums">
          {formatTime(entry.occurredAt, timeZone, i18n.language)}
        </time>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${typeColors[entry.type]}`}
        >
          {t(`tracking.types.${entry.type}`)}
        </span>
        {entry.title && <span className="font-medium">{entry.title}</span>}
        {entry.type === 'symptom' && entry.symptomType && (
          <span className="font-medium">
            {t(`tracking.symptoms.${entry.symptomType}`)}
            <span className="ml-2 font-normal text-fg/75">
              {t('tracking.severityValue', { value: entry.severity })}
            </span>
          </span>
        )}
        {entry.type === 'stool' && entry.bristol && (
          <span className="font-medium">
            {t('tracking.bristolType', { value: entry.bristol })}
            <span className="ml-2 font-normal text-fg/75">
              {t(`tracking.bristolDescriptions.${entry.bristol}`)}
            </span>
          </span>
        )}
        {entry.type === 'sleep' && entry.sleepMinutes && (
          <span className="font-medium">
            {t('tracking.sleepDuration', {
              hours: Math.floor(entry.sleepMinutes / 60),
              minutes: entry.sleepMinutes % 60,
            })}
            {entry.rating && (
              <span className="ml-2 font-normal text-fg/75">
                {t(`tracking.ratings.sleep.${entry.rating}`)}
              </span>
            )}
          </span>
        )}
        {entry.type === 'stress' && entry.rating && (
          <span className="font-medium">
            {t(`tracking.ratings.stress.${entry.rating}`)}
            <span className="ml-2 font-normal text-fg/75">
              {t('tracking.ratingValue', { value: entry.rating })}
            </span>
          </span>
        )}
      </div>

      {entry.ingredients.length > 0 && (
        <p className="text-sm text-fg/75">
          {entry.ingredients
            .map((ingredient) => ingredientName(ingredient, i18n.language))
            .sort((a, b) => a.localeCompare(b, i18n.language))
            .join(', ')}
        </p>
      )}
      {allergens.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <AllergenChips allergens={allergens} />
        </div>
      )}
      {entry.note && <p className="text-sm italic text-fg/75">{entry.note}</p>}

      <ErrorMessage error={remove.error} />
      <div className="flex items-center gap-3 pt-1 text-sm">
        {confirming ? (
          <>
            <span>{t('tracking.confirmDelete')}</span>
            <Button
              type="button"
              onClick={() => remove.mutate(entry.id)}
              disabled={remove.isPending}
              className="px-3 py-1"
            >
              {t('tracking.delete')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setConfirming(false)}
              className="px-3 py-1"
            >
              {t('tracking.cancel')}
            </Button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onEdit}
              className="font-medium text-accent hover:underline"
            >
              {t('tracking.edit')}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="font-medium text-accent hover:underline"
            >
              {t('tracking.delete')}
            </button>
          </>
        )}
      </div>
    </li>
  );
}
