// Names of an ingredient by language. A catalog entry has one per language it is translated into.
// A name typed by a user has no language and is stored under NEUTRAL_LOCALE.
export type IngredientNames = Readonly<Record<string, string>>;

export const NEUTRAL_LOCALE = 'und';
export const REFERENCE_LOCALE = 'en';

// The requested language first, then English, then the neutral name, then any other.
export function localizedName(names: IngredientNames, locale: string): string {
  const language = locale.split('-')[0] ?? locale;
  return (
    names[language] ??
    names[REFERENCE_LOCALE] ??
    names[NEUTRAL_LOCALE] ??
    Object.entries(names).sort(([a], [b]) => a.localeCompare(b))[0]?.[1] ??
    ''
  );
}

// Language-independent name for exports, the report and the AI payload.
export function referenceName(names: IngredientNames): string {
  return localizedName(names, REFERENCE_LOCALE);
}
