import { useTranslation } from 'react-i18next';
import type { Confidence, SuspectDto } from '@foodlog/shared';
import { ingredientName } from '../lib/format.ts';

const badge: Record<Confidence, string> = {
  high: 'bg-coral text-ink',
  medium: 'bg-coral/40 text-fg',
  low: 'bg-fg/10 text-fg',
};

function percent(value: number) {
  return `${Math.round(value * 100)} %`;
}

function factor(value: number) {
  return value >= 10 ? value.toFixed(0) : value.toFixed(1);
}

function LagBars({ histogram, label }: { histogram: number[]; label: string }) {
  const max = Math.max(1, ...histogram);
  return (
    <span
      role="img"
      aria-label={`${label}: ${histogram.join(', ')}`}
      className="flex h-6 items-end gap-0.5"
    >
      {histogram.map((count, index) => (
        <span
          key={index}
          className="w-2 rounded-t-sm bg-accent"
          style={{
            height: `${Math.max(count ? 12 : 4, (count / max) * 100)}%`,
            opacity: count ? 1 : 0.25,
          }}
        />
      ))}
    </span>
  );
}

export function SuspectsTable({ suspects, caption }: { suspects: SuspectDto[]; caption: string }) {
  const { t, i18n } = useTranslation();

  const label = (suspect: SuspectDto) =>
    suspect.ingredient
      ? ingredientName(suspect.ingredient, i18n.language)
      : t(`tracking.allergens.${suspect.allergen}`);

  const delay = (minutes: number | null) => {
    if (minutes === null) return '–';
    if (minutes < 60) return t('analysis.suspects.minutes', { count: Math.round(minutes) });
    return t('analysis.suspects.hoursMinutes', {
      hours: Math.floor(minutes / 60),
      minutes: Math.round(minutes % 60),
    });
  };

  if (suspects.length === 0) {
    return <p className="text-fg/75">{t('analysis.suspects.none')}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-fg/20 text-fg/75">
            <th scope="col" className="py-2 pr-3 font-medium">
              {t('analysis.suspects.name')}
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              {t('analysis.suspects.exposures')}
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              {t('analysis.suspects.withOutcome')}
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              {t('analysis.suspects.baseline')}
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              {t('analysis.suspects.risk')}
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              {t('analysis.suspects.confidence')}
            </th>
            <th scope="col" className="py-2 font-medium">
              {t('analysis.suspects.delay')}
            </th>
          </tr>
        </thead>
        <tbody>
          {suspects.map((suspect) => (
            <tr key={suspect.key} className="border-b border-fg/10 align-top">
              <th scope="row" className="py-2 pr-3 font-medium">
                {label(suspect)}
                {suspect.alsoWith.length > 0 && (
                  <span className="block text-xs font-normal text-fg/75">
                    {t('analysis.suspects.alsoWith', {
                      names: suspect.alsoWith
                        .map((ingredient) => ingredientName(ingredient, i18n.language))
                        .join(', '),
                    })}
                  </span>
                )}
              </th>
              <td className="py-2 pr-3 tabular-nums">{suspect.exposures}</td>
              <td className="py-2 pr-3 tabular-nums">
                {suspect.exposuresWithOutcome} ({percent(suspect.rateExposed)})
              </td>
              <td className="py-2 pr-3 tabular-nums">{percent(suspect.rateUnexposed)}</td>
              <td className="py-2 pr-3 tabular-nums">
                <span className="font-semibold">{factor(suspect.relativeRisk)}×</span>
                <span className="block text-xs text-fg/75">
                  {factor(suspect.ciLow)}–{factor(suspect.ciHigh)}
                </span>
              </td>
              <td className="py-2 pr-3">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge[suspect.confidence]}`}
                >
                  {t(`analysis.suspects.confidenceLevels.${suspect.confidence}`)}
                </span>
              </td>
              <td className="py-2">
                <span className="block">{delay(suspect.medianLagMinutes)}</span>
                <LagBars
                  histogram={suspect.lagHistogram}
                  label={t('analysis.suspects.delayChart')}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
