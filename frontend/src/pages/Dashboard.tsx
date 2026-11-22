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

type FormState =
  { mode: 'create'; type: EntryType } | { mode: 'edit'; entry: EntryDto; type: EntryType } | null;

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
        <div className="grid w-full grid-flow-col auto-cols-fr gap-2 sm:flex sm:w-auto">
          <Button
            type="button"
            variant="secondary"
            aria-label={t('tracking.previousDay')}
            onClick={() => goTo(shiftDate(date, -1))}
          >
            <span aria-hidden="true">‹</span>
          </Button>
          {date !== today && (
            <Button
              type="button"
              variant="secondary"
              className="flex items-center justify-center gap-1.5"
              onClick={() => goTo(today)}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M3 10h18M8 3v4M16 3v4" />
              </svg>
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

      <section
        aria-label={t('tracking.addEntry')}
        className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
      >
        {ENTRY_TYPES.filter(
          (type) => !isContextType(type) || me?.features.context_factors || type === form?.type,
        ).map((type) => (
          <Button
            key={type}
            type="button"
            variant={form === null || form.type === type ? 'primary' : 'secondary'}
            aria-pressed={form === null ? undefined : form.type === type}
            className="w-full sm:w-auto"
            onClick={() =>
              setForm(form?.mode === 'edit' ? { ...form, type } : { mode: 'create', type })
            }
          >
            {t(`tracking.types.${type}`)}
          </Button>
        ))}
      </section>
      {form && (
        <EntryForm
          key={form.mode === 'edit' ? form.entry.id : 'create'}
          initial={form.mode === 'edit' ? form.entry : undefined}
          type={form.type}
          defaultTime={defaultTime}
          timeZone={timeZone}
          onDone={() => {
            const editedId = form.mode === 'edit' ? form.entry.id : null;
            setForm(null);
            if (editedId) {
              requestAnimationFrame(() =>
                document
                  .getElementById(`entry-${editedId}`)
                  ?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }),
              );
            }
          }}
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
            onEdit={() => setForm({ mode: 'edit', entry, type: entry.type })}
          />
        ))}
      </ul>
    </>
  );
}
