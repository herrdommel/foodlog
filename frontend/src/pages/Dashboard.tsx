import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  ENTRY_TYPES,
  isContextType,
  isDateString,
  shiftDate,
  todayInTimeZone,
  utcToWallTime,
  type EntryDto,
  type EntryType,
} from '@foodlog/shared';
import { useEntries, useMe } from '../api/hooks.ts';
import { EntryCard } from '../components/EntryCard.tsx';
import { EntryForm } from '../components/EntryForm.tsx';
import { Button, ErrorMessage } from '../components/ui.tsx';
import { formatDay } from '../lib/format.ts';

type FormState = { mode: 'create'; type: EntryType } | { mode: 'edit'; entry: EntryDto } | null;

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { data: me } = useMe();
  const [params, setParams] = useSearchParams();
  const [form, setForm] = useState<FormState>(null);

  const timeZone = me?.user.timezone ?? 'UTC';
  const today = todayInTimeZone(timeZone);
  const requested = params.get('date');
  const date = requested && isDateString(requested) && requested <= today ? requested : today;
  const entries = useEntries(date);

  const goTo = (target: string) => {
    setForm(null);
    setParams(target === today ? {} : { date: target });
  };

  const defaultTime = date === today ? utcToWallTime(new Date(), timeZone) : `${date}T12:00`;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{formatDay(date, i18n.language)}</h1>
          {date === today && <p className="text-sm text-fg/75">{t('tracking.today')}</p>}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            aria-label={t('tracking.previousDay')}
            onClick={() => goTo(shiftDate(date, -1))}
          >
            <span aria-hidden="true">‹</span>
          </Button>
          {date !== today && (
            <Button type="button" variant="secondary" onClick={() => goTo(today)}>
              {t('tracking.goToToday')}
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            aria-label={t('tracking.nextDay')}
            disabled={date >= today}
            onClick={() => goTo(shiftDate(date, 1))}
          >
            <span aria-hidden="true">›</span>
          </Button>
        </div>
      </div>

      {form === null ? (
        <section aria-label={t('tracking.addEntry')} className="flex flex-wrap gap-2">
          {ENTRY_TYPES.filter((type) => !isContextType(type) || me?.features.context_factors).map(
            (type) => (
              <Button key={type} type="button" onClick={() => setForm({ mode: 'create', type })}>
                {t(`tracking.types.${type}`)}
              </Button>
            ),
          )}
        </section>
      ) : (
        <EntryForm
          key={form.mode === 'edit' ? form.entry.id : form.type}
          initial={form.mode === 'edit' ? form.entry : undefined}
          type={form.mode === 'edit' ? form.entry.type : form.type}
          defaultTime={defaultTime}
          timeZone={timeZone}
          onDone={() => setForm(null)}
        />
      )}

      <ErrorMessage error={entries.error} />
      {entries.data?.length === 0 && (
        <p className="rounded-2xl bg-raised p-6 text-fg/75">{t('tracking.empty')}</p>
      )}
      <ul className="space-y-3">
        {entries.data?.map((entry) => (
          <EntryCard
            key={entry.id}
            entry={entry}
            timeZone={timeZone}
            onEdit={() => setForm({ mode: 'edit', entry })}
          />
        ))}
      </ul>
    </>
  );
}
