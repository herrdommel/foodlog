import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { IngredientDto } from '@foodlog/shared';
import { useAiSettings, useRecognizePhoto } from '../api/hooks.ts';
import { blobToDataUrl, downscaleImage } from '../lib/image.ts';
import { IngredientSuggestions } from './IngredientSuggestions.tsx';
import { Button, ErrorMessage, FilePicker, Notice } from './ui.tsx';

export function PhotoRecognition({ onAdd }: { onAdd: (ingredients: IngredientDto[]) => void }) {
  const { t } = useTranslation();
  const settings = useAiSettings();
  const recognize = useRecognizePhoto();
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState<{ blob: Blob; preview: string } | null>(null);
  const [prepareError, setPrepareError] = useState<string | null>(null);

  const reset = () => {
    setOpen(false);
    setPhoto(null);
    setPrepareError(null);
    recognize.reset();
  };

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setPrepareError(null);
    recognize.reset();
    try {
      const blob = await downscaleImage(file);
      setPhoto({ blob, preview: await blobToDataUrl(blob) });
    } catch {
      setPhoto(null);
      setPrepareError('invalid_image');
    }
  };

  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        onClick={() => setOpen(true)}
        className="w-full sm:w-auto"
      >
        {t('photo.open')}
      </Button>
    );
  }

  const data = settings.data;
  const ready = Boolean(data?.provider && data.model && data.photoConsent.given);

  return (
    <section
      aria-label={t('photo.title')}
      className="w-full space-y-3 rounded-lg border border-fg/15 p-3"
    >
      <h3 className="text-sm font-semibold">{t('photo.title')}</h3>
      <ErrorMessage error={settings.error} />
      {data && !ready && (
        <Notice>
          {t('photo.notReady')}{' '}
          <Link to="/ai" className="underline">
            {t('photo.setup')}
          </Link>
        </Notice>
      )}
      {data && ready && !recognize.data && (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <FilePicker label={t('photo.take')} capture onFile={(file) => void choose(file)} />
            <FilePicker label={t('photo.choose')} onFile={(file) => void choose(file)} />
          </div>
          <ErrorMessage error={prepareError} />
          {photo && (
            <div className="space-y-2">
              <img
                src={photo.preview}
                alt={t('photo.previewAlt')}
                className="max-h-64 rounded-lg border border-fg/15"
              />
              <p className="text-sm text-fg/75">
                {t('photo.sendNote', {
                  provider: t(`ai.provider.${data.provider}`),
                  model: data.model,
                })}
              </p>
              <ErrorMessage error={recognize.error} />
              <Button
                type="button"
                disabled={recognize.isPending}
                onClick={() => recognize.mutate(photo.blob)}
              >
                {recognize.isPending ? t('photo.working') : t('photo.analyse')}
              </Button>
            </div>
          )}
        </>
      )}
      {recognize.data && (
        <>
          <p className="text-sm text-fg/75">{t('photo.guess')}</p>
          <IngredientSuggestions
            suggestions={recognize.data.suggestions}
            onAdd={(ingredients) => {
              onAdd(ingredients);
              reset();
            }}
            onCancel={reset}
          />
        </>
      )}
      {!recognize.data && (
        <Button type="button" variant="secondary" onClick={reset} className="w-full sm:w-auto">
          {t('tracking.cancel')}
        </Button>
      )}
    </section>
  );
}
