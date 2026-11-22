import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  AI_PROVIDERS,
  ANALYSIS_OUTCOMES,
  ANALYSIS_WINDOWS,
  shiftDate,
  todayInTimeZone,
  type AiProviderId,
  type AiSettingsDto,
  type AnalysisOutcome,
} from '@foodlog/shared';
import {
  useAiAnalyze,
  useAiModels,
  useAiPreview,
  useAiSettings,
  useDeleteAiKey,
  useGiveAiConsent,
  useGiveAiPhotoConsent,
  useMe,
  useSaveAiKey,
  useUpdateAiSettings,
  useWithdrawAiConsent,
  useWithdrawAiPhotoConsent,
} from '../api/hooks.ts';
import { Button, Card, ErrorMessage, Field, Notice, SelectField } from '../components/ui.tsx';
import { readAnalysisParams, toSearchParams, type AnalysisParams } from '../lib/analysisParams.ts';

function ProviderCard({ settings }: { settings: AiSettingsDto }) {
  const { t } = useTranslation();
  const save = useSaveAiKey();
  const remove = useDeleteAiKey();
  const update = useUpdateAiSettings();
  const [apiKey, setApiKey] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [chosenModel, setChosenModel] = useState<string | null>(null);
  const provider = settings.provider ?? 'anthropic';
  const keyInfo = settings.keys[provider];
  const models = useAiModels(provider, keyInfo.configured);

  const model =
    chosenModel ?? settings.model ?? models.data?.suggested ?? models.data?.models[0] ?? '';

  const choose = (next: AiProviderId) => {
    setApiKey('');
    setReplacing(false);
    save.reset();
    if (settings.keys[next].configured) update.mutate({ provider: next });
    else update.mutate({ provider: next, model: null }, { onError: () => undefined });
  };

  const submitKey = (event: FormEvent) => {
    event.preventDefault();
    save.mutate(
      { provider, apiKey: apiKey.trim() },
      {
        onSuccess: () => {
          setApiKey('');
          setReplacing(false);
        },
      },
    );
  };

  return (
    <Card title={t('ai.provider.title')}>
      <ErrorMessage error={save.error ?? remove.error ?? update.error} />
      <SelectField
        label={t('ai.provider.choose')}
        value={provider}
        onChange={(event) => choose(event.target.value as AiProviderId)}
      >
        {AI_PROVIDERS.map((id) => (
          <option key={id} value={id}>
            {t(`ai.provider.${id}`)}
          </option>
        ))}
      </SelectField>

      {keyInfo.configured && !replacing ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">{t('ai.provider.stored', { last4: keyInfo.last4 })}</p>
          <Button type="button" variant="secondary" onClick={() => setReplacing(true)}>
            {t('ai.provider.replace')}
          </Button>
          <Button type="button" variant="secondary" onClick={() => remove.mutate(provider)}>
            {t('ai.provider.remove')}
          </Button>
        </div>
      ) : (
        <form onSubmit={submitKey} className="space-y-3">
          {!keyInfo.configured && <p className="text-sm text-fg/75">{t('ai.provider.none')}</p>}
          <Field
            label={t('ai.provider.key')}
            type="password"
            autoComplete="off"
            spellCheck={false}
            required
            hint={t('ai.provider.keyHint')}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
          <Button type="submit" disabled={save.isPending || apiKey.trim().length < 8}>
            {keyInfo.configured ? t('ai.provider.replace') : t('ai.provider.save')}
          </Button>
        </form>
      )}

      {keyInfo.configured && (
        <div className="space-y-3 border-t border-fg/10 pt-4">
          {models.isPending && (
            <p className="text-sm text-fg/75">{t('ai.provider.loadingModels')}</p>
          )}
          <ErrorMessage error={models.error} />
          {models.data && (
            <>
              <SelectField
                label={t('ai.provider.model')}
                value={model}
                onChange={(event) => setChosenModel(event.target.value)}
              >
                {models.data.models.map((id) => (
                  <option key={id} value={id}>
                    {id}
                    {id === models.data.suggested ? ` (${t('ai.provider.suggested')})` : ''}
                  </option>
                ))}
              </SelectField>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  disabled={!model || model === settings.model || update.isPending}
                  onClick={() => update.mutate({ model })}
                >
                  {t('ai.provider.saveModel')}
                </Button>
                {settings.model && settings.model === model && (
                  <span className="text-sm text-accent">{t('ai.provider.modelSaved')}</span>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function ConsentCard({ settings }: { settings: AiSettingsDto }) {
  const { t, i18n } = useTranslation();
  const give = useGiveAiConsent();
  const withdraw = useWithdrawAiConsent();
  const [checked, setChecked] = useState(false);
  const date = settings.consent.at
    ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' }).format(
        new Date(settings.consent.at),
      )
    : '';

  return (
    <Card title={t('ai.consent.title')}>
      <p className="text-sm">{t('ai.consent.text')}</p>
      <ErrorMessage error={give.error ?? withdraw.error} />
      {settings.consent.given ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">{t('ai.consent.given', { date })}</p>
          <Button type="button" variant="secondary" onClick={() => withdraw.mutate()}>
            {t('ai.consent.withdraw')}
          </Button>
        </div>
      ) : (
        <>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
            />
            {t('ai.consent.checkbox')}
          </label>
          <Button type="button" disabled={!checked || give.isPending} onClick={() => give.mutate()}>
            {t('ai.consent.give')}
          </Button>
        </>
      )}
    </Card>
  );
}

function PhotoConsentCard({ settings }: { settings: AiSettingsDto }) {
  const { t, i18n } = useTranslation();
  const give = useGiveAiPhotoConsent();
  const withdraw = useWithdrawAiPhotoConsent();
  const [checked, setChecked] = useState(false);
  const date = settings.photoConsent.at
    ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' }).format(
        new Date(settings.photoConsent.at),
      )
    : '';

  return (
    <Card title={t('ai.photoConsent.title')}>
      <p className="text-sm">{t('ai.photoConsent.text')}</p>
      <ErrorMessage error={give.error ?? withdraw.error} />
      {settings.photoConsent.given ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">{t('ai.photoConsent.given', { date })}</p>
          <Button type="button" variant="secondary" onClick={() => withdraw.mutate()}>
            {t('ai.consent.withdraw')}
          </Button>
        </div>
      ) : (
        <>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
            />
            {t('ai.photoConsent.checkbox')}
          </label>
          <Button type="button" disabled={!checked || give.isPending} onClick={() => give.mutate()}>
            {t('ai.consent.give')}
          </Button>
        </>
      )}
    </Card>
  );
}

function RunCard({ settings }: { settings: AiSettingsDto }) {
  const { t, i18n } = useTranslation();
  const { data: me } = useMe();
  const timeZone = me?.user.timezone ?? 'UTC';
  const [searchParams, setSearchParams] = useSearchParams();
  const params = readAnalysisParams(searchParams, timeZone);
  const today = todayInTimeZone(timeZone);
  const preview = useAiPreview();
  const analyze = useAiAnalyze();

  const body = {
    from: params.from,
    to: params.to,
    window: params.window,
    outcome: params.outcome,
    minSeverity: params.minSeverity,
  };

  const update = (changes: Partial<AnalysisParams>) => {
    preview.reset();
    analyze.reset();
    setSearchParams(toSearchParams({ ...params, ...changes }), { replace: true });
  };

  const ready = Boolean(settings.provider && settings.model && settings.consent.given);
  const result = analyze.data;
  const shown = preview.data;

  return (
    <Card title={t('ai.run.title')}>
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
      <div className="flex flex-wrap gap-2">
        {[7, 30, 90].map((days) => (
          <Button
            key={days}
            type="button"
            variant="secondary"
            onClick={() => update({ from: shiftDate(today, -(days - 1)), to: today })}
          >
            {t(`analysis.last${days}`)}
          </Button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          label={t('analysis.window')}
          value={params.window}
          onChange={(event) => update({ window: Number(event.target.value) })}
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
        >
          {Array.from({ length: 11 }, (_, value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </SelectField>
      </div>

      {!ready && (
        <p role="status" className="rounded-lg bg-accent/15 px-3 py-2 text-sm">
          {t('ai.run.needSetup')}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={() => preview.mutate(body)}
          disabled={preview.isPending}
        >
          {t('ai.run.preview')}
        </Button>
        <Button
          type="button"
          onClick={() => analyze.mutate(body)}
          disabled={!ready || analyze.isPending}
        >
          {t('ai.run.start')}
        </Button>
      </div>

      <ErrorMessage error={preview.error ?? analyze.error} />
      {analyze.isPending && <Notice>{t('ai.run.running')}</Notice>}

      {shown && (
        <section
          aria-label={t('ai.run.previewTitle')}
          className="space-y-3 rounded-xl border border-fg/15 p-4"
        >
          <h3 className="font-semibold">{t('ai.run.previewTitle')}</h3>
          <p className="text-sm text-fg/75">{t('ai.run.previewIntro')}</p>
          <p className="text-sm">
            {t('ai.run.entries', { count: shown.entryCount })} ·{' '}
            {t('ai.run.size', { size: (shown.bytes / 1024).toFixed(1) })}
          </p>
          {shown.truncated && <Notice>{t('ai.run.truncated', { count: shown.entryCount })}</Notice>}
          <details>
            <summary className="cursor-pointer text-sm font-medium">
              {t('ai.run.systemPrompt')}
            </summary>
            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-fg/5 p-3 text-xs">
              {shown.system}
            </pre>
          </details>
          <details>
            <summary className="cursor-pointer text-sm font-medium">{t('ai.run.data')}</summary>
            <pre
              tabIndex={0}
              className="mt-2 max-h-72 overflow-auto rounded-lg bg-fg/5 p-3 text-xs"
            >
              {JSON.stringify(shown.data, null, 2)}
            </pre>
          </details>
          <p className="text-xs text-fg/75">
            {t('ai.run.hash')}: <span className="font-mono">{shown.payloadHash.slice(0, 16)}</span>
          </p>
        </section>
      )}

      {result && (
        <section
          aria-label={t('ai.run.result')}
          className="space-y-3 rounded-xl border border-fg/15 p-4"
        >
          <h3 className="font-semibold">{t('ai.run.result')}</h3>
          <p role="note" className="rounded-lg bg-coral/20 px-3 py-2 text-sm">
            {t('ai.disclaimer')}
          </p>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{result.text}</div>
          <p className="text-xs text-fg/75">
            {t('ai.run.by', {
              model: result.model,
              provider: t(`ai.provider.${result.provider}`),
              date: new Intl.DateTimeFormat(i18n.language, {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(result.generatedAt)),
            })}
          </p>
          {shown && (
            <p className="text-xs text-fg/75">
              {shown.payloadHash === result.payloadHash
                ? t('ai.run.sameData')
                : t('ai.run.differentData')}
            </p>
          )}
        </section>
      )}
    </Card>
  );
}

export function AiPage() {
  const { t } = useTranslation();
  const settings = useAiSettings();
  const { data: me } = useMe();
  return (
    <>
      <h1 className="text-2xl font-bold">{t('ai.title')}</h1>
      <p className="text-sm text-fg/75">{t('ai.intro')}</p>
      <p role="note" className="rounded-2xl bg-coral/20 p-4 text-sm">
        {t('ai.disclaimer')}
      </p>
      <ErrorMessage error={settings.error} />
      {settings.data && (
        <>
          <ProviderCard settings={settings.data} />
          <ConsentCard settings={settings.data} />
          {me?.features.ai_photo && <PhotoConsentCard settings={settings.data} />}
          <RunCard settings={settings.data} />
        </>
      )}
      <p className="text-sm">
        <Link to="/analysis" className="text-accent hover:underline">
          {t('nav.analysis')}
        </Link>
      </p>
    </>
  );
}
