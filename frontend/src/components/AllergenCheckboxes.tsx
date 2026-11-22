import { useTranslation } from 'react-i18next';
import { ALLERGENS, type Allergen } from '@foodlog/shared';

export function AllergenCheckboxes({
  value,
  onChange,
}: {
  value: Allergen[];
  onChange: (allergens: Allergen[]) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:flex sm:flex-wrap">
      {ALLERGENS.map((allergen) => (
        <label key={allergen} className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={value.includes(allergen)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...value, allergen]
                  : value.filter((item) => item !== allergen),
              )
            }
          />
          {t(`tracking.allergens.${allergen}`)}
        </label>
      ))}
    </div>
  );
}
