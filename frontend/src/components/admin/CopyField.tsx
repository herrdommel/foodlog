import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui.tsx';

export function CopyField({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-1">
      <label htmlFor="copy-field" className="block text-sm font-medium">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id="copy-field"
          readOnly
          value={value}
          onFocus={(event) => event.target.select()}
          className="min-w-0 flex-1 rounded-lg border border-fg/20 bg-raised px-3 py-2 font-mono text-sm"
        />
        <Button type="button" variant="secondary" onClick={copy}>
          {copied ? t('admin.detail.copied') : t('admin.detail.copy')}
        </Button>
      </div>
    </div>
  );
}
