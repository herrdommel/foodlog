import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isValidBarcode, type IngredientDto, type ProductLookupDto } from '@foodlog/shared';
import { useLookupProduct } from '../api/hooks.ts';
import { IngredientSuggestions } from './IngredientSuggestions.tsx';
import { Button, ErrorMessage, Field } from './ui.tsx';

export function BarcodeLookup({
  onAdd,
}: {
  onAdd: (ingredients: IngredientDto[], productName: string) => void;
}) {
  const { t } = useTranslation();
  const lookup = useLookupProduct();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [product, setProduct] = useState<ProductLookupDto | null>(null);

  const reset = () => {
    setOpen(false);
    setCode('');
    setProduct(null);
    setInvalid(false);
    lookup.reset();
  };

  const search = (value = code) => {
    const trimmed = value.trim();
    setProduct(null);
    if (!isValidBarcode(trimmed)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    lookup.mutate(trimmed, { onSuccess: setProduct });
  };

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {t('barcode.open')}
      </Button>
    );
  }

  const productLabel = product ? [product.brand, product.name].filter(Boolean).join(' ') : '';

  return (
    <section
      aria-label={t('barcode.title')}
      className="space-y-3 rounded-lg border border-fg/15 p-3"
    >
      <h3 className="text-sm font-semibold">{t('barcode.title')}</h3>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Field
            label={t('barcode.number')}
            inputMode="numeric"
            autoComplete="off"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                search();
              }
            }}
          />
        </div>
        <Button type="button" onClick={() => search()} disabled={lookup.isPending}>
          {t('barcode.lookup')}
        </Button>
      </div>
      <ErrorMessage error={invalid ? 'invalid_barcode' : lookup.error} />
      {product && (
        <>
          <p className="text-sm">
            <span className="font-medium">{productLabel || product.barcode}</span>
          </p>
          <IngredientSuggestions
            suggestions={product.suggestions}
            onAdd={(ingredients) => {
              onAdd(ingredients, productLabel);
              reset();
            }}
            onCancel={reset}
          />
          <p className="text-xs text-fg/75">
            {t('barcode.attribution')}{' '}
            <a
              href={`https://world.openfoodfacts.org/product/${product.barcode}`}
              target="_blank"
              rel="noreferrer noopener"
              className="underline"
            >
              Open Food Facts
            </a>
          </p>
        </>
      )}
      {!product && (
        <Button type="button" variant="secondary" onClick={reset}>
          {t('tracking.cancel')}
        </Button>
      )}
    </section>
  );
}
