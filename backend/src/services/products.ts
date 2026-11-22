import type { Allergen, ProductLookupDto } from '@foodlog/shared';
import { OFF_ALLERGENS, OFF_IGNORED, OFF_TO_CATALOG } from '../catalog/open-food-facts.ts';
import type { Database } from '../db/client.ts';
import { MINUTE } from '../lib/time.ts';
import { allergensFromName, cleanName, resolveCandidates, type Candidate } from './suggestions.ts';

export class ProductLookupError extends Error {
  readonly kind: 'not_found' | 'unreachable';

  constructor(kind: 'not_found' | 'unreachable') {
    super(kind);
    this.kind = kind;
  }
}

export interface OffProduct {
  name: string;
  brand: string | null;
  ingredients: { id: string; text: string }[];
  allergens: string[];
}

const USER_AGENT = 'FoodlogIO (https://github.com/herrdommel/foodlog)';
const TIMEOUT_MS = 6_000;
const CACHE_TTL = 60 * MINUTE;
const CACHE_SIZE = 500;
const MAX_INGREDIENTS = 25;
const FIELDS = 'product_name,brands,ingredients,allergens_tags';

type Fetch = typeof fetch;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseProduct(body: unknown): OffProduct | null {
  const root = body as { status?: unknown; product?: Record<string, unknown> } | null;
  const product = root?.product;
  if (!product || root?.status === 0) return null;
  const list = Array.isArray(product.ingredients) ? product.ingredients : [];
  return {
    name: text(product.product_name),
    brand: text(product.brands).split(',')[0]?.trim() || null,
    ingredients: list.flatMap((item: Record<string, unknown>) =>
      text(item?.id) && text(item?.text) ? [{ id: text(item.id), text: text(item.text) }] : [],
    ),
    allergens: Array.isArray(product.allergens_tags) ? product.allergens_tags.map(String) : [],
  };
}

export function createOpenFoodFacts(options: { baseUrl: string; fetch?: Fetch }) {
  const fetchImpl = options.fetch ?? fetch;
  const cache = new Map<string, { at: number; product: OffProduct | null }>();

  return {
    async lookup(barcode: string): Promise<OffProduct | null> {
      const hit = cache.get(barcode);
      if (hit && Date.now() - hit.at < CACHE_TTL) return hit.product;

      let product: OffProduct | null;
      try {
        const url = new URL(
          `${options.baseUrl.replace(/\/+$/, '')}/api/v2/product/${barcode}.json`,
        );
        url.searchParams.set('fields', FIELDS);
        const response = await fetchImpl(url, {
          headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (response.status === 404) product = null;
        else if (!response.ok) throw new ProductLookupError('unreachable');
        else product = parseProduct(await response.json());
      } catch (error) {
        if (error instanceof ProductLookupError) throw error;
        throw new ProductLookupError('unreachable');
      }

      if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!);
      cache.set(barcode, { at: Date.now(), product });
      return product;
    },
  };
}

export type OpenFoodFacts = ReturnType<typeof createOpenFoodFacts>;

export async function buildProductLookup(
  db: Database,
  userId: string,
  barcode: string,
  product: OffProduct,
): Promise<ProductLookupDto> {
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  for (const { id, text: label } of product.ingredients) {
    if (seen.has(id) || OFF_IGNORED.has(id) || /^[a-z]{2}:e\d{3}/.test(id)) continue;
    seen.add(id);
    const name = cleanName(label);
    if (!name) continue;
    candidates.push({
      catalogKey: OFF_TO_CATALOG[id] ?? null,
      name,
      allergens: allergensFromName(`${id.slice(3)} ${label}`.replace(/-/g, ' ')),
    });
    if (candidates.length >= MAX_INGREDIENTS) break;
  }

  const suggestions = await resolveCandidates(db, userId, candidates);

  const covered = new Set<Allergen>([
    ...suggestions.matched.flatMap((ingredient) => ingredient.allergens),
    ...suggestions.proposed.flatMap((ingredient) => ingredient.allergens),
  ]);
  const declared = new Set(product.allergens.flatMap((tag) => OFF_ALLERGENS[tag] ?? []));
  const uncovered = [...declared].filter((allergen) => !covered.has(allergen)).sort();
  const productName = cleanName(product.name) ?? cleanName(product.brand ?? '');
  if (uncovered.length > 0 && productName) {
    suggestions.proposed.push({ name: productName, allergens: uncovered, source: 'product' });
  }

  return { barcode, name: product.name, brand: product.brand, suggestions };
}
