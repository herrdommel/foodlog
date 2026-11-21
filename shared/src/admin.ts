import { z } from 'zod';
import { emailSchema, nameSchema, roleSchema, type localeSchema } from './auth.ts';
import { featureKeySchema, type FeatureKey } from './features.ts';

export const adminUsersQuerySchema = z.object({
  q: z.string().trim().max(100).default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const adminUserUpdateSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    role: roleSchema,
    active: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'no changes');

export const resetLinkSchema = z.object({ delivery: z.enum(['email', 'link']) });

export const inviteCreateSchema = z
  .object({
    email: emailSchema.optional(),
    sendMail: z.boolean().default(false),
    expiresInDays: z.number().int().min(1).max(30).default(14),
  })
  .refine((value) => !value.sendMail || Boolean(value.email), {
    message: 'email required to send an invitation',
    path: ['email'],
  });

export const settingsUpdateSchema = z.object({ publicRegistration: z.boolean() });

export const featureUpdateSchema = z
  .object({ enabled: z.boolean(), defaultForUsers: z.boolean() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'no changes');

export const userFeatureSchema = z.object({ enabled: z.boolean().nullable() });

export { featureKeySchema };

export interface AdminUserDto {
  id: string;
  email: string;
  name: string;
  role: z.infer<typeof roleSchema>;
  active: boolean;
  emailVerified: boolean;
  locale: z.infer<typeof localeSchema>;
  timezone: string;
  createdAt: string;
  googleLinked: boolean;
  hasPassword: boolean;
  entryCount: number;
}

export interface AdminUserFeatureDto {
  key: FeatureKey;
  globalEnabled: boolean;
  defaultForUsers: boolean;
  override: boolean | null;
  effective: boolean;
}

export interface AdminUserDetailDto extends AdminUserDto {
  features: AdminUserFeatureDto[];
}

export interface AdminUsersPageDto {
  users: AdminUserDto[];
  total: number;
  page: number;
  pageSize: number;
}

export type InviteStatus = 'open' | 'used' | 'expired';

export interface InviteDto {
  id: string;
  email: string | null;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  usedByEmail: string | null;
  status: InviteStatus;
}

export interface CreatedInviteDto extends InviteDto {
  link: string;
  emailSent: boolean;
}

export interface AdminFeatureFlagDto {
  key: FeatureKey;
  enabled: boolean;
  defaultForUsers: boolean;
}

export interface AdminSettingsDto {
  publicRegistration: boolean;
  features: AdminFeatureFlagDto[];
}

export interface AuditEntryDto {
  id: string;
  actor: string | null;
  action: string;
  target: string | null;
  createdAt: string;
}

export interface ResetLinkDto {
  delivery: 'email' | 'link';
  link: string | null;
}
