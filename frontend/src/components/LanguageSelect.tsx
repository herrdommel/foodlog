import { DE, GB } from 'country-flag-icons/react/3x2';
import { LOCALES, type Locale } from '@foodlog/shared';
import { Select, type SelectOption } from './Select.tsx';

const LANGUAGES: Record<Locale, { name: string; Flag: typeof DE }> = {
  de: { name: 'Deutsch', Flag: DE },
  en: { name: 'English', Flag: GB },
};

const OPTIONS: SelectOption<Locale>[] = LOCALES.map((locale) => {
  const { name, Flag } = LANGUAGES[locale];
  return {
    value: locale,
    label: name,
    short: locale.toUpperCase(),
    icon: <Flag aria-hidden="true" className="h-4 w-6 shrink-0 rounded-[3px] ring-1 ring-fg/20" />,
  };
});

export function LanguageSelect({
  label,
  value,
  onChange,
  variant,
}: {
  label: string;
  value: Locale;
  onChange: (locale: Locale) => void;
  variant: 'compact' | 'field';
}) {
  return (
    <Select label={label} options={OPTIONS} value={value} onChange={onChange} variant={variant} />
  );
}
