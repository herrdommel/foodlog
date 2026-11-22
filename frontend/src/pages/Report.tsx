import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { useAnalysis, useMe } from '../api/hooks.ts';
import { BristolChart, SymptomsPerDayChart } from '../components/AnalysisCharts.tsx';
import { ContextFactors } from '../components/ContextFactors.tsx';
import { SuspectsTable } from '../components/SuspectsTable.tsx';
import { Button, ErrorMessage } from '../components/ui.tsx';
import { readAnalysisParams, toSearchParams } from '../lib/analysisParams.ts';

export function ReportPage() {
  const { t, i18n } = useTranslation();
  const { data: me } = useMe();
  const timeZone = me?.user.timezone ?? 'UTC';
  const [searchParams] = useSearchParams();
  const params = readAnalysisParams(searchParams, timeZone);
  const analysis = useAnalysis(params);
  const data = analysis.data;

  const outcomeLabel =
    params.outcome === 'symptoms' || params.outcome === 'stool'
      ? t(`analysis.outcomes.${params.outcome}`)
      : t(`tracking.symptoms.${params.outcome}`);
  const generated = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long', timeZone }).format(
    new Date(),
  );

  return (
    <article className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          to={{ pathname: '/analysis', search: `?${new URLSearchParams(toSearchParams(params))}` }}
          className="text-sm font-medium text-accent hover:underline"
        >
          {t('report.back')}
        </Link>
        <Button type="button" onClick={() => window.print()}>
          {t('report.print')}
        </Button>
      </div>

      <header className="space-y-1">
        <h1 className="text-3xl font-bold">{t('report.title')}</h1>
        {me && <p>{t('report.for', { name: me.user.name })}</p>}
        <p>{t('report.period', { from: params.from, to: params.to })}</p>
        <p className="text-sm text-fg/75">
          {t('report.settings', { window: params.window, outcome: outcomeLabel })}
        </p>
        <p className="text-sm text-fg/75">{t('report.generated', { date: generated })}</p>
      </header>

      <p
        role="note"
        className="rounded-2xl bg-coral/20 p-4 text-sm print:border print:border-fg/40 print:bg-transparent"
      >
        {t('analysis.disclaimer')}
      </p>

      <ErrorMessage error={analysis.error} />

      {data && (
        <>
          <section className="space-y-3 break-inside-avoid">
            <h2 className="text-xl font-semibold">{t('report.summaryTitle')}</h2>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                [
                  t('analysis.summary.entries'),
                  Object.values(data.summary.entryCounts).reduce((a, b) => a + b, 0),
                ],
                [t('analysis.summary.days'), data.summary.daysWithEntries],
                [t('analysis.summary.food'), data.summary.foodEntries],
                [t('analysis.summary.events'), data.summary.outcomeEvents],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-xl border border-fg/20 p-3">
                  <dd className="text-2xl font-bold tabular-nums">{value}</dd>
                  <dt className="text-sm text-fg/75">{label}</dt>
                </div>
              ))}
            </dl>
          </section>

          <section className="space-y-3 break-inside-avoid">
            <h2 className="text-xl font-semibold">{t('analysis.suspects.title')}</h2>
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
          </section>

          {me?.features.context_factors && (
            <ContextFactors factors={data.context} minDays={data.minExposures} as="section" />
          )}

          <div className="break-inside-avoid">
            <SymptomsPerDayChart data={data.symptomsByDay} />
          </div>
          <div className="break-inside-avoid">
            <BristolChart data={data.bristolDistribution} />
          </div>

          <section className="space-y-2 break-inside-avoid">
            <h2 className="text-xl font-semibold">{t('report.methodTitle')}</h2>
            <p className="text-sm">
              {t('report.method', { exposures: data.minExposures, outcomes: data.minOutcomes })}
            </p>
          </section>
        </>
      )}
    </article>
  );
}
