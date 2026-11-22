import { z } from 'zod';
import { isDateString, isWallTime } from './time.ts';

export const ALLERGENS = [
  'gluten',
  'lactose',
  'milk_protein',
  'egg',
  'tree_nuts',
  'peanut',
  'soy',
  'fish',
  'shellfish',
  'sesame',
  'celery',
  'mustard',
  'lupin',
  'sulfite',
  'histamine',
  'fructose',
  'sorbitol',
  'fodmap',
  'caffeine',
  'alcohol',
  'spicy',
] as const;
export const allergenSchema = z.enum(ALLERGENS);
export type Allergen = z.infer<typeof allergenSchema>;

export const SYMPTOM_TYPES = [
  'abdominal_pain',
  'cramps',
  'bloating',
  'gas',
  'nausea',
  'heartburn',
  'headache',
  'skin_rash',
  'itching',
  'fatigue',
  'dizziness',
  'other',
] as const;
export const symptomTypeSchema = z.enum(SYMPTOM_TYPES);
export type SymptomType = z.infer<typeof symptomTypeSchema>;

export const ENTRY_TYPES = ['meal', 'drink', 'symptom', 'stool', 'medication'] as const;
export const entryTypeSchema = z.enum(ENTRY_TYPES);
export type EntryType = z.infer<typeof entryTypeSchema>;

export const TEMPLATE_TYPES = ['meal', 'drink', 'medication'] as const;
export const templateTypeSchema = z.enum(TEMPLATE_TYPES);

export const wallTimeSchema = z.string().refine(isWallTime, 'invalid time');
export const dateSchema = z.string().refine(isDateString, 'invalid date');

const noteSchema = z.string().trim().max(1000).nullish();
const titleSchema = z.string().trim().max(120);
const ingredientIdsSchema = z.array(z.uuid()).max(50).default([]);

const foodEntrySchema = z
  .object({
    type: z.enum(['meal', 'drink']),
    occurredAt: wallTimeSchema,
    title: titleSchema.nullish(),
    ingredientIds: ingredientIdsSchema,
    note: noteSchema,
  })
  .refine((entry) => Boolean(entry.title) || entry.ingredientIds.length > 0, {
    message: 'title or ingredients required',
    path: ['title'],
  });

export const entryInputSchema = z.discriminatedUnion('type', [
  foodEntrySchema,
  z.object({
    type: z.literal('symptom'),
    occurredAt: wallTimeSchema,
    symptomType: symptomTypeSchema,
    severity: z.number().int().min(0).max(10),
    note: noteSchema,
  }),
  z.object({
    type: z.literal('stool'),
    occurredAt: wallTimeSchema,
    bristol: z.number().int().min(1).max(7),
    note: noteSchema,
  }),
  z.object({
    type: z.literal('medication'),
    occurredAt: wallTimeSchema,
    title: titleSchema.min(1),
    note: noteSchema,
  }),
]);
export type EntryInput = z.infer<typeof entryInputSchema>;

export const entriesQuerySchema = z.object({ date: dateSchema });

export const ingredientInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  allergens: z.array(allergenSchema).max(ALLERGENS.length).default([]),
});

export const ingredientUpdateSchema = ingredientInputSchema.partial();

export const ingredientSearchSchema = z.object({
  q: z.string().trim().max(80).default(''),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  scope: z.enum(['all', 'catalog']).default('all'),
});

export const templateInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: templateTypeSchema,
  title: titleSchema.nullish(),
  ingredientIds: ingredientIdsSchema,
});

export interface IngredientDto {
  id: string;
  nameDe: string;
  nameEn: string;
  custom: boolean;
  allergens: Allergen[];
}

export interface CustomIngredientDto extends IngredientDto {
  entryCount: number;
}

export interface EntryDto {
  id: string;
  type: EntryType;
  occurredAt: string;
  title: string | null;
  note: string | null;
  symptomType: SymptomType | null;
  severity: number | null;
  bristol: number | null;
  ingredients: IngredientDto[];
}

export interface TemplateDto {
  id: string;
  name: string;
  type: z.infer<typeof templateTypeSchema>;
  title: string | null;
  ingredients: IngredientDto[];
}

export const ANALYSIS_WINDOWS = [3, 8, 12, 24, 48] as const;
export const ANALYSIS_OUTCOMES = ['symptoms', 'stool', ...SYMPTOM_TYPES] as const;
export const analysisOutcomeSchema = z.enum(ANALYSIS_OUTCOMES);
export type AnalysisOutcome = z.infer<typeof analysisOutcomeSchema>;

export const MAX_ANALYSIS_DAYS = 366;

export const analysisQuerySchema = z
  .object({
    from: dateSchema,
    to: dateSchema,
    window: z.coerce
      .number()
      .int()
      .refine((value) => (ANALYSIS_WINDOWS as readonly number[]).includes(value), 'invalid window')
      .default(8),
    outcome: analysisOutcomeSchema.default('symptoms'),
    minSeverity: z.coerce.number().int().min(0).max(10).default(3),
  })
  .refine((query) => query.from <= query.to, { message: 'from must not be after to', path: ['to'] })
  .refine(
    (query) =>
      (Date.parse(`${query.to}T00:00:00Z`) - Date.parse(`${query.from}T00:00:00Z`)) / 86_400_000 <
      MAX_ANALYSIS_DAYS,
    { message: 'period too long', path: ['to'] },
  );
export type AnalysisQuery = z.infer<typeof analysisQuerySchema>;

export const exportQuerySchema = z
  .object({ from: dateSchema, to: dateSchema })
  .refine((query) => query.from <= query.to, { message: 'from must not be after to', path: ['to'] })
  .refine(
    (query) =>
      (Date.parse(`${query.to}T00:00:00Z`) - Date.parse(`${query.from}T00:00:00Z`)) / 86_400_000 <
      MAX_ANALYSIS_DAYS,
    { message: 'period too long', path: ['to'] },
  );

export type Confidence = 'low' | 'medium' | 'high';

export interface SuspectDto {
  key: string;
  ingredient: IngredientDto | null;
  allergen: Allergen | null;
  exposures: number;
  exposuresWithOutcome: number;
  rateExposed: number;
  rateUnexposed: number;
  relativeRisk: number;
  ciLow: number;
  ciHigh: number;
  confidence: Confidence;
  medianLagMinutes: number | null;
  lagHistogram: number[];
  alsoWith: IngredientDto[];
}

export interface AnalysisDto {
  period: { from: string; to: string; days: number };
  window: number;
  outcome: AnalysisOutcome;
  minSeverity: number;
  summary: {
    entryCounts: Record<EntryType, number>;
    daysWithEntries: number;
    foodEntries: number;
    outcomeEvents: number;
    censoredFoodEntries: number;
  };
  topIngredients: { ingredient: IngredientDto; count: number }[];
  symptomsByDay: { date: string; count: number; maxSeverity: number }[];
  bristolDistribution: number[];
  symptomHeatmap: number[][];
  suspects: { ingredients: SuspectDto[]; allergens: SuspectDto[] };
  minExposures: number;
  minOutcomes: number;
}

export const AI_PROVIDERS = ['anthropic', 'openai'] as const;
export const aiProviderSchema = z.enum(AI_PROVIDERS);
export type AiProviderId = z.infer<typeof aiProviderSchema>;

export const AI_CONSENT_VERSION = 1;
export const AI_PHOTO_CONSENT_VERSION = 1;

export const aiKeySchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(8)
    .max(400)
    .refine((value) => !/\s/.test(value), 'must not contain whitespace'),
});

export const aiSettingsUpdateSchema = z
  .object({
    provider: aiProviderSchema.nullable(),
    model: z.string().trim().min(1).max(100).nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'no changes');

export const aiConsentSchema = z.object({ version: z.literal(AI_CONSENT_VERSION) });
export const aiPhotoConsentSchema = z.object({ version: z.literal(AI_PHOTO_CONSENT_VERSION) });

export const aiRunSchema = analysisQuerySchema;

export interface AiSettingsDto {
  provider: AiProviderId | null;
  model: string | null;
  keys: Record<AiProviderId, { configured: boolean; last4: string | null }>;
  consent: { given: boolean; version: number; currentVersion: number; at: string | null };
  photoConsent: { given: boolean; at: string | null };
}

export interface AiModelsDto {
  models: string[];
  suggested: string | null;
}

export interface AiPreviewDto {
  system: string;
  data: unknown;
  entryCount: number;
  truncated: boolean;
  bytes: number;
  payloadHash: string;
}

export interface AiResultDto {
  text: string;
  provider: AiProviderId;
  model: string;
  payloadHash: string;
  generatedAt: string;
}
