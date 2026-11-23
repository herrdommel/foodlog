import { describe, expect, it } from 'vitest';
import { CATALOG } from './ingredients.ts';
import { CATALOG_NAMES } from './names.ts';

describe('catalog names', () => {
  const keys = CATALOG.map(([key]) => key);

  it('has unique keys', () => {
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('names every entry in English, the reference language', () => {
    expect(keys.filter((key) => !CATALOG_NAMES.en?.[key])).toEqual([]);
  });

  it('only names entries that exist', () => {
    for (const [locale, names] of Object.entries(CATALOG_NAMES)) {
      expect(
        Object.keys(names).filter((key) => !keys.includes(key)),
        locale,
      ).toEqual([]);
    }
  });

  it('is fully translated into German', () => {
    expect(keys.filter((key) => !CATALOG_NAMES.de?.[key])).toEqual([]);
  });

  it('keeps names within the column length', () => {
    for (const names of Object.values(CATALOG_NAMES)) {
      for (const name of Object.values(names)) expect(name.length).toBeLessThanOrEqual(80);
    }
  });
});
