import { and, asc, eq, isNull } from 'drizzle-orm';
import { referenceName } from '@foodlog/shared';
import type { Database } from '../db/client.ts';
import {
  adminAudit,
  aiKeys,
  aiSettings,
  entries,
  ingredients,
  mfaRecoveryCodes,
  mfaTotp,
  passkeys,
  oauthAccounts,
  templateIngredients,
  templates,
  userFeatureOverrides,
  type users,
} from '../db/schema.ts';
import { toEntryDtos } from './entries.ts';
import { toIngredientDtos } from './ingredients.ts';

export const EXPORT_VERSION = 1;

export async function buildAccountExport(db: Database, user: typeof users.$inferSelect) {
  const [
    entryRows,
    customRows,
    templateRows,
    [settings],
    keyRows,
    overrides,
    google,
    actions,
    [totp],
    passkeyRows,
    recoveryRows,
  ] = await Promise.all([
    db
      .select()
      .from(entries)
      .where(eq(entries.userId, user.id))
      .orderBy(asc(entries.occurredAt), asc(entries.createdAt)),
    db.select().from(ingredients).where(eq(ingredients.userId, user.id)),
    db.select().from(templates).where(eq(templates.userId, user.id)),
    db.select().from(aiSettings).where(eq(aiSettings.userId, user.id)),
    db.select().from(aiKeys).where(eq(aiKeys.userId, user.id)),
    db.select().from(userFeatureOverrides).where(eq(userFeatureOverrides.userId, user.id)),
    db.select().from(oauthAccounts).where(eq(oauthAccounts.userId, user.id)),
    db
      .select({ action: adminAudit.action, detail: adminAudit.detail, at: adminAudit.createdAt })
      .from(adminAudit)
      .where(eq(adminAudit.targetUserId, user.id))
      .orderBy(asc(adminAudit.createdAt)),
    db.select().from(mfaTotp).where(eq(mfaTotp.userId, user.id)),
    db.select().from(passkeys).where(eq(passkeys.userId, user.id)),
    db
      .select({ id: mfaRecoveryCodes.id })
      .from(mfaRecoveryCodes)
      .where(and(eq(mfaRecoveryCodes.userId, user.id), isNull(mfaRecoveryCodes.usedAt))),
  ]);

  const entryDtos = await toEntryDtos(db, entryRows);
  const customDtos = await toIngredientDtos(db, customRows);

  const templateLinks = await Promise.all(
    templateRows.map(async (row) => {
      const links = await db
        .select({ ingredientId: templateIngredients.ingredientId })
        .from(templateIngredients)
        .where(eq(templateIngredients.templateId, row.id));
      return [row.id, links.map((link) => link.ingredientId)] as const;
    }),
  );
  const linkedByTemplate = new Map(templateLinks);
  const names = new Map<string, string>();
  for (const entry of entryDtos) {
    for (const ingredient of entry.ingredients)
      names.set(ingredient.id, referenceName(ingredient.names));
  }
  for (const dto of customDtos) names.set(dto.id, referenceName(dto.names));

  return {
    exportVersion: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    note: 'All times are UTC. Ingredient names are given in English; custom ingredients keep the name you typed.',
    profile: {
      name: user.name,
      email: user.email,
      role: user.role,
      locale: user.locale,
      timezone: user.timezone,
      avatar: user.avatar === 'upload' ? 'uploaded image' : user.avatar,
      emailVerified: user.emailVerifiedAt !== null,
      createdAt: user.createdAt.toISOString(),
      privacyConsentAt: user.privacyConsentAt?.toISOString() ?? null,
      signInMethods: [
        ...(user.passwordHash ? ['password'] : []),
        ...google.map((account) => account.provider),
      ],
    },
    entries: entryDtos.map((entry) => ({
      id: entry.id,
      type: entry.type,
      occurredAt: entry.occurredAt,
      title: entry.title,
      note: entry.note,
      symptomType: entry.symptomType,
      severity: entry.severity,
      bristolType: entry.bristol,
      sleepMinutes: entry.sleepMinutes,
      rating: entry.rating,
      ingredients: entry.ingredients.map((ingredient) => ({
        name: referenceName(ingredient.names),
        custom: ingredient.custom,
        allergens: ingredient.allergens,
      })),
    })),
    customIngredients: customDtos.map((dto) => ({
      name: referenceName(dto.names),
      allergens: dto.allergens,
    })),
    templates: templateRows.map((row) => ({
      name: row.name,
      type: row.type,
      title: row.title,
      ingredients: (linkedByTemplate.get(row.id) ?? [])
        .map((id) => names.get(id))
        .filter((name) => name !== undefined),
    })),
    aiSettings: {
      provider: settings?.provider ?? null,
      model: settings?.model ?? null,
      consentVersion: settings?.consentVersion ?? null,
      consentAt: settings?.consentAt?.toISOString() ?? null,
      photoConsentVersion: settings?.photoConsentVersion ?? null,
      photoConsentAt: settings?.photoConsentAt?.toISOString() ?? null,
      storedKeys: keyRows.map((row) => ({
        provider: row.provider,
        endsIn: row.last4,
        storedAt: row.createdAt.toISOString(),
      })),
    },
    twoFactor: {
      authenticatorApp: Boolean(totp?.confirmedAt),
      passkeys: passkeyRows.map((row) => ({
        name: row.name,
        addedAt: row.createdAt.toISOString(),
        lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      })),
      unusedRecoveryCodes: recoveryRows.length,
    },
    featureOverrides: overrides.map((row) => ({ feature: row.key, enabled: row.enabled })),
    actionsByAdministrators: actions.map((row) => ({
      action: row.action,
      detail: row.detail,
      at: row.at.toISOString(),
    })),
  };
}
