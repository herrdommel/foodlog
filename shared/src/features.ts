import { z } from 'zod';

export const FEATURE_KEYS = ['ai_analysis', 'google_login', 'data_export'] as const;

export const featureKeySchema = z.enum(FEATURE_KEYS);

export type FeatureKey = z.infer<typeof featureKeySchema>;

export type FeatureFlags = Record<FeatureKey, boolean>;
