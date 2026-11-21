import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { LOCALES, type Locale } from '@foodlog/shared';
import de from './de.json';
import en from './en.json';

const STORAGE_KEY = 'foodlog.lang';

function readStoredLocale(): Locale | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored && (LOCALES as readonly string[]).includes(stored) ? (stored as Locale) : null;
  } catch {
    return null;
  }
}

function detectLocale(): Locale {
  const stored = readStoredLocale();
  if (stored) return stored;
  return navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en';
}

export function setLocale(locale: Locale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    document.documentElement.lang = locale;
  }
  void i18n.changeLanguage(locale);
  document.documentElement.lang = locale;
}

export async function initI18n(locale: Locale = detectLocale()) {
  await i18n.use(initReactI18next).init({
    resources: { de: { translation: de }, en: { translation: en } },
    lng: locale,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
  document.documentElement.lang = locale;
  return i18n;
}

export { i18n };
