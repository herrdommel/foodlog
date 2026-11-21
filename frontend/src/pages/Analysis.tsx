import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import {
  ANALYSIS_OUTCOMES,
  ANALYSIS_WINDOWS,
  shiftDate,
  todayInTimeZone,
  type AnalysisOutcome,
} from '@foodlog/shared';
import { useAnalysis, useMe } from '../api/hooks.ts';
import {
  BristolChart,
  Heatmap,
  SymptomsPerDayChart,
  TopIngredients,
} from '../components/AnalysisCharts.tsx';
import { SuspectsTable } from '../components/SuspectsTable.tsx';
import { Button, Card, ErrorMessage, Field, SelectField } from '../components/ui.tsx';
import { readAnalysisParams, toSearchParams, type AnalysisParams } from '../lib/analysisParams.ts';

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-raised p-4 shadow-sm">
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-sm text-fg/75">{label}</p>
    </div>
  );
}

export function AnalysisPage() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const timeZone = me?.user.timezone ?? 'UTC';
  const [searchParams, setSearchParams] = useSearchParams();
  const params = readAnalysisParams(searchParams, timeZone);
  const analysis = useAnalysis(params);
  const data = analysis.data;
  const today = todayInTimeZone(timeZone);

  const update = (changes: Partial<AnalysisParams>) =>
    setSearchParams(toSearchParams({ ...params, ...changes }), { replace: true });

  const preset = (days: number) => update({ from: shiftDate(today, -(days - 1)), to: today });
  const activeDays =
    params.to === today
      ? (Date.parse(`${params.to}T00:00:00Z`) - Date.parse(`${params.from}T00:00:00Z`)) /
          86_400_000 +
        1
      : 0;

  const enoughData = data
    ? data.summary.foodEntries >= data.minExposures &&
      data.summary.outcomeEvents >= data.minOutcomes
    : true;

  return (
    <>
      <h1 className="text-2xl font-bold">{t('analysis.title')}</h1>

      <p role="note" className="rounded-2xl bg-coral/20 p-4 text-sm">
        {t('analysis.disclaimer')}
      </p>

      <Card title={t('analysis.period')}>
        <div className="flex flex-wrap gap-2">
          {[7, 30, 90].map((days) => (
            <Button
              key={days}
              type="button"
              variant={activeDays === days ? 'primary' : 'secondary'}
              aria-pressed={activeDays === days}
              onClick={() => preset(days)}
            >
              {t(`analysis.last${days}`)}
            </Button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('analysis.from')}
            type="date"
            value={params.from}
            max={params.to}
            onChange={(event) => event.target.value && update({ from: event.target.value })}
          />
          <Field
            label={t('analysis.to')}
            type="date"
            value={params.to}
            min={params.from}
            max={today}
            onChange={(event) => event.target.value && update({ to: event.target.value })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            label={t('analysis.window')}
            value={params.window}
            onChange={(event) => update({ window: Number(event.target.value) })}
            className="w-full rounded-lg border border-fg/20 bg-raised px-3 py-2"
          >
            {ANALYSIS_WINDOWS.map((hours) => (
              <option key={hours} value={hours}>
                {t('analysis.windowHours', { count: hours })}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t('analysis.outcome')}
            value={params.outcome}
            onChange={(event) => update({ outcome: event.target.value as AnalysisOutcome })}
            className="w-full rounded-lg border border-fg/20 bg-raised px-3 py-2"
          >
            {ANALYSIS_OUTCOMES.map((value) => (
              <option key={value} value={value}>
                {value === 'symptoms' || value === 'stool'
                  ? t(`analysis.outcomes.${value}`)
                  : t(`tracking.symptoms.${value}`)}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t('analysis.minSeverity')}
            value={params.minSeverity}
            disabled={params.outcome === 'stool'}
            onChange={(event) => update({ minSeverity: Number(event.target.value) })}
            className="w-full rounded-lg border border-fg/20 bg-raised px-3 py-2 disabled:opacity-50"
          >
            {Array.from({ length: 11 }, (_, value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </SelectField>
        </div>
      </Card>

      <ErrorMessage error={analysis.error} />
      {!data && analysis.isPending && <p className="text-fg/75">{t('analysis.loading')}</p>}

      {data && (
        <>
          <section
            aria-label={t('analysis.summary.entries')}
            className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          >
            <Tile
              label={t('analysis.summary.entries')}
              value={Object.values(data.summary.entryCounts).reduce((sum, value) => sum + value, 0)}
            />
            <Tile label={t('analysis.summary.days')} value={data.summary.daysWithEntries} />
            <Tile label={t('analysis.summary.food')} value={data.summary.foodEntries} />
            <Tile label={t('analysis.summary.events')} value={data.summary.outcomeEvents} />
          </section>
          {data.summary.censoredFoodEntries > 0 && (
            <p className="text-sm text-fg/75">
              {t('analysis.summary.censored', { count: data.summary.censoredFoodEntries })}
            </p>
          )}

          <Card title={t('analysis.suspects.title')}>
            <p className="text-sm text-fg/75">{t('analysis.suspects.hint')}</p>
            {!enoughData && (
              <p role="status" className="rounded-lg bg-accent/15 px-3 py-2 text-sm">
                {t('analysis.notEnough', {
                  exposures: data.minExposures,
                  outcomes: data.minOutcomes,
                })}
              </p>
            )}
            <h3 className="font-semibold">{t('analysis.suspects.allergens')}</h3>
            <SuspectsTable
              suspects={data.suspects.allergens}
              caption={`${t('analysis.suspects.title')}: ${t('analysis.suspects.allergens')}`}
            />
            <h3 className="font-semibold">{t('analysis.suspects.ingredients')}</h3>
            <SuspectsTable
              suspects={data.suspects.ingredients}
              caption={`${t('analysis.suspects.title')}: ${t('analysis.suspects.ingredients')}`}
            />
          </Card>

          <SymptomsPerDayChart data={data.symptomsByDay} />
          <div className="grid gap-6 md:grid-cols-2">
            <BristolChart data={data.bristolDistribution} />
            <TopIngredients data={data.topIngredients} />
          </div>
          <Heatmap data={data.symptomHeatmap} />
        </>
      )}
    </>
  );
}
