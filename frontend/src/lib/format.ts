import { localizedName, NEUTRAL_LOCALE, referenceName, type IngredientDto } from '@foodlog/shared';

export function ingredientName(ingredient: IngredientDto, language: string): string {
  return localizedName(ingredient.names, language);
}

// The name a person typed for their own ingredient, as it is edited.
export function typedName(ingredient: IngredientDto): string {
  return ingredient.names[NEUTRAL_LOCALE] ?? referenceName(ingredient.names);
}

export function formatTime(iso: string, timeZone: string, language: string): string {
  return new Intl.DateTimeFormat(language, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatDay(date: string, language: string): string {
  return new Intl.DateTimeFormat(language, {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00Z`));
}
