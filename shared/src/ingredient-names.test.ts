import { describe, expect, it } from 'vitest';
import { localizedName, referenceName } from './ingredient-names.ts';

describe('localizedName', () => {
  const catalog = { de: 'Milch', en: 'Milk', fr: 'Lait' };

  it('uses the requested language, also for regional variants', () => {
    expect(localizedName(catalog, 'fr')).toBe('Lait');
    expect(localizedName(catalog, 'de-AT')).toBe('Milch');
  });

  it('falls back to English, then to the neutral name, then to any name', () => {
    expect(localizedName({ de: 'Milch', en: 'Milk' }, 'nl')).toBe('Milk');
    expect(localizedName({ und: 'Omas Suppe' }, 'de')).toBe('Omas Suppe');
    expect(localizedName({ und: 'Omas Suppe', de: 'Suppe' }, 'en')).toBe('Omas Suppe');
    expect(localizedName({ pl: 'Mleko', nl: 'Melk' }, 'de')).toBe('Melk');
    expect(localizedName({}, 'de')).toBe('');
  });

  it('has a language-independent reference name', () => {
    expect(referenceName(catalog)).toBe('Milk');
    expect(referenceName({ und: 'Omas Suppe' })).toBe('Omas Suppe');
  });
});
