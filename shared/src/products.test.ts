import { describe, expect, it } from 'vitest';
import { isValidBarcode } from './products.ts';

describe('isValidBarcode', () => {
  it('accepts EAN-13, EAN-8, UPC-A and GTIN-14 with a correct check digit', () => {
    expect(isValidBarcode('3017620422003')).toBe(true);
    expect(isValidBarcode('96385074')).toBe(true);
    expect(isValidBarcode('036000291452')).toBe(true);
    expect(isValidBarcode('10012345678902')).toBe(true);
  });

  it('rejects a wrong check digit, wrong lengths and non-digits', () => {
    expect(isValidBarcode('3017620422004')).toBe(false);
    expect(isValidBarcode('301762042200')).toBe(false);
    expect(isValidBarcode('30176204220A3')).toBe(false);
    expect(isValidBarcode('../../etc')).toBe(false);
    expect(isValidBarcode('')).toBe(false);
  });
});
