import { z } from 'zod';
import type { Allergen, IngredientDto } from './tracking.ts';

export function isValidBarcode(code: string): boolean {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop()!;
  const sum = digits
    .reverse()
    .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export const barcodeSchema = z
  .string()
  .trim()
  .refine(isValidBarcode, 'Not a valid EAN or UPC barcode');

export interface ProposedIngredient {
  name: string;
  allergens: Allergen[];
  source: 'ingredient' | 'product';
}

export interface IngredientSuggestionsDto {
  matched: IngredientDto[];
  proposed: ProposedIngredient[];
}

export interface ProductLookupDto {
  barcode: string;
  name: string;
  brand: string | null;
  suggestions: IngredientSuggestionsDto;
}
