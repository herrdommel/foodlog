import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BrowserMultiFormatReader } from '@zxing/browser';
import { isValidBarcode } from '@foodlog/shared';
import { Button, FilePicker } from './ui.tsx';

type Controls = { stop: () => void };

// The scanner is large and only needed when someone actually scans, so it loads on demand.
async function createReader(): Promise<BrowserMultiFormatReader> {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ]);
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
  ]);
  return new BrowserMultiFormatReader(hints);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function canUseCamera(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

export function BarcodeScanner({ onDetected }: { onDetected: (code: string) => void }) {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<Controls | null>(null);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const stop = () => {
    controls.current?.stop();
    controls.current = null;
    setScanning(false);
  };

  useEffect(
    () => () => {
      controls.current?.stop();
    },
    [],
  );

  const startCamera = async () => {
    setMessage(null);
    setScanning(true);
    try {
      const reader = await createReader();
      controls.current = await reader.decodeFromConstraints(
        { video: { facingMode: 'environment' } },
        video.current ?? undefined,
        (result) => {
          const code = result?.getText();
          if (code && isValidBarcode(code)) {
            stop();
            onDetected(code);
          }
        },
      );
    } catch {
      setScanning(false);
      setMessage(t('barcode.cameraFailed'));
    }
  };

  const readPhoto = async (file: File | undefined) => {
    if (!file) return;
    setMessage(null);
    try {
      const reader = await createReader();
      const result = await reader.decodeFromImageUrl(await readAsDataUrl(file));
      if (!isValidBarcode(result.getText())) throw new Error('not a barcode');
      onDetected(result.getText());
    } catch {
      setMessage(t('barcode.notFoundInPhoto'));
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {canUseCamera() && !scanning && (
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={startCamera}
          >
            {t('barcode.scanCamera')}
          </Button>
        )}
        {scanning && (
          <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={stop}>
            {t('barcode.stopCamera')}
          </Button>
        )}
        <FilePicker
          label={t('barcode.takePhoto')}
          capture
          onFile={(file) => void readPhoto(file)}
        />
        <FilePicker label={t('barcode.scanPhoto')} onFile={(file) => void readPhoto(file)} />
      </div>
      {scanning && (
        <video
          ref={video}
          muted
          playsInline
          aria-label={t('barcode.cameraView')}
          className="aspect-video w-full rounded-lg bg-dark object-cover"
        />
      )}
      {!canUseCamera() && <p className="text-xs text-fg/75">{t('barcode.noCamera')}</p>}
      {message && (
        <p role="alert" className="rounded-lg bg-coral/15 px-3 py-2 text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
