import { useTranslation } from 'react-i18next';
import { ANALYSIS_OUTCOMES, ANALYSIS_WINDOWS, type AnalysisOutcome } from '@foodlog/shared';
import type { AnalysisParams } from '../lib/analysisParams.ts';
import { Select } from './Select.tsx';

export function AnalysisParamFields({
  params,
  onChange,
}: {
  params: AnalysisParams;
  onChange: (changes: Partial<AnalysisParams>) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Select
        label={t('analysis.window')}
        value={params.window}
        onChange={(window) => onChange({ window })}
        options={ANALYSIS_WINDOWS.map((hours) => ({
          value: hours,
          label: t('analysis.windowHours', { count: hours }),
        }))}
      />
      <Select<AnalysisOutcome>
        label={t('analysis.outcome')}
        value={params.outcome}
        onChange={(outcome) => onChange({ outcome })}
        options={ANALYSIS_OUTCOMES.map((value) => ({
          value,
          label:
            value === 'symptoms' || value === 'stool'
              ? t(`analysis.outcomes.${value}`)
              : t(`tracking.symptoms.${value}`),
        }))}
      />
      <Select
        label={t('analysis.minSeverity')}
        value={params.minSeverity}
        disabled={params.outcome === 'stool'}
        onChange={(minSeverity) => onChange({ minSeverity })}
        options={Array.from({ length: 11 }, (_, value) => ({ value, label: String(value) }))}
      />
    </div>
  );
}
