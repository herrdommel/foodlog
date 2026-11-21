import { useTranslation } from 'react-i18next';
import type { Allergen } from '@foodlog/shared';

export function AllergenChips({ allergens }: { allergens: Allergen[] }) {
  const { t } = useTranslation();
  if (allergens.length === 0) return null;
  return (
    <>
      {allergens.map((allergen) => (
        <span
          key={allergen}
          className="rounded-full bg-coral/25 px-2 py-0.5 text-xs font-medium text-fg"
        >
          {t(`tracking.allergens.${allergen}`)}
        </span>
      ))}
    </>
  );
}
