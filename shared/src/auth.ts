import { z } from 'zod';

export const LOCALES = ['de', 'en'] as const;
export const localeSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof localeSchema>;

export const ROLES = ['user', 'admin'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const PRESET_AVATAR_COUNT = 12;

export const avatarSchema = z.union([
  z.literal('upload'),
  z
    .string()
    .regex(/^preset:\d{1,2}$/)
    .refine((value) => {
      const index = Number(value.slice('preset:'.length));
      return index >= 1 && index <= PRESET_AVATAR_COUNT;
    }),
]);

export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());
export const nameSchema = z.string().trim().min(1).max(100);
export const passwordSchema = z.string().min(10).max(128);
export const tokenSchema = z.string().min(20).max(200);
export const timezoneSchema = z
  .string()
  .max(64)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'invalid timezone');

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  locale: localeSchema.default('de'),
  inviteToken: tokenSchema.optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const tokenBodySchema = z.object({ token: tokenSchema });

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: tokenSchema,
  password: passwordSchema,
});

export const updateProfileSchema = z
  .object({
    name: nameSchema,
    avatar: avatarSchema,
    locale: localeSchema,
    timezone: timezoneSchema,
  })
  .partial();

export const changeEmailSchema = z.object({
  newEmail: emailSchema,
  password: z.string().min(1).max(128).optional(),
});

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  avatar: string;
  role: Role;
  locale: Locale;
  timezone: string;
  hasPassword: boolean;
  googleLinked: boolean;
}

export interface MeResponse {
  user: PublicUser;
  features: Record<string, boolean>;
}

export interface AuthConfig {
  publicRegistration: boolean;
  googleLogin: boolean;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
