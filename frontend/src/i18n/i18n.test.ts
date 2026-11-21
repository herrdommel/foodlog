import { describe, expect, it } from 'vitest';
import de from './de.json';
import en from './en.json';

function keys(object: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(object).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? keys(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe('translations', () => {
  it('has the same keys in German and English', () => {
    expect(keys(de).sort()).toEqual(keys(en).sort());
  });

  it('has no empty values', () => {
    for (const file of [de, en]) {
      const values = JSON.stringify(file).match(/:\s*""/g);
      expect(values).toBeNull();
    }
  });
});
