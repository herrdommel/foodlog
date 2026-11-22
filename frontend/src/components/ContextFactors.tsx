import { useTranslation } from 'react-i18next';
import type { Confidence, ContextFactorDto } from '@foodlog/shared';
import { Card } from './ui.tsx';

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

export function ContextFactors({
  factors,
  minDays,
  as = 'card',
}: {
  factors: ContextFactorDto[];
  minDays: number;
  as?: 'card' | 'section';
}) {
  const { t } = useTranslation();

  const content = (
    <>
      <p className="text-sm text-fg/75">{t('analysis.context.hint')}</p>
      {factors.length === 0 ? (
        <p role="status" className="rounded-lg bg-accent/15 px-3 py-2 text-sm">
          {t('analysis.context.notEnough', { days: minDays })}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <caption className="sr-only">{t('analysis.context.title')}</caption>
            <thead>
              <tr className="border-b border-fg/20 text-fg/75">
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t('analysis.context.factor')}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t('analysis.context.withFactor')}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t('analysis.context.without')}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t('analysis.suspects.risk')}
                </th>
                <th scope="col" className="py-2 font-medium">
                  {t('analysis.suspects.confidence')}
                </th>
              </tr>
            </thead>
            <tbody>
              {factors.map((item) => (
                <tr key={item.factor} className="border-b border-fg/10 align-top">
                  <th scope="row" className="py-2 pr-3 font-medium">
                    {t(`analysis.context.factors.${item.factor}`)}
                  </th>
                  <td className="py-2 pr-3 tabular-nums">
                    {t('analysis.context.days', {
                      with: item.daysWithOutcome,
                      total: item.days,
                      share: percent(item.rate),
                    })}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">
                    {t('analysis.context.days', {
                      with: item.otherDaysWithOutcome,
                      total: item.otherDays,
                      share: percent(item.otherRate),
                    })}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">
                    <span className="font-semibold">{factor(item.relativeRisk)}</span>
                    <span className="block text-xs text-fg/75">
                      {factor(item.ciLow)} to {factor(item.ciHigh)}
                    </span>
                  </td>
                  <td className="py-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge[item.confidence]}`}
                    >
                      {t(`analysis.suspects.confidenceLevels.${item.confidence}`)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );

  if (as === 'section') {
    return (
      <section className="space-y-3 break-inside-avoid">
        <h2 className="text-xl font-semibold">{t('analysis.context.title')}</h2>
        {content}
      </section>
    );
  }
  return <Card title={t('analysis.context.title')}>{content}</Card>;
}
