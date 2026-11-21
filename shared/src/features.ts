import { z } from 'zod';

export const FEATURE_KEYS = ['ai_analysis', 'google_login', 'data_export'] as const;

export const featureKeySchema = z.enum(FEATURE_KEYS);

export type FeatureKey = z.infer<typeof featureKeySchema>;

export type FeatureFlags = Record<FeatureKey, boolean>;

export const FEATURE_DEFAULTS: Record<FeatureKey, { enabled: boolean; defaultForUsers: boolean }> =
  {
    ai_analysis: { enabled: true, defaultForUsers: false },
    google_login: { enabled: true, defaultForUsers: true },
    data_export: { enabled: true, defaultForUsers: true },
  };

export function resolveFlag(
  row: { enabled: boolean; defaultForUsers: boolean } | undefined,
  key: FeatureKey,
  override: boolean | undefined,
): boolean {
  const flag = row ?? FEATURE_DEFAULTS[key];
  if (!flag.enabled) return false;
  return override ?? flag.defaultForUsers;
}
