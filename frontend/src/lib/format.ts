import type { IngredientDto } from '@foodlog/shared';

export function ingredientName(ingredient: IngredientDto, language: string): string {
  return language === 'de' ? ingredient.nameDe : ingredient.nameEn;
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
