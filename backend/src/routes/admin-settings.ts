import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  FEATURE_DEFAULTS,
  FEATURE_KEYS,
  featureKeySchema,
  featureUpdateSchema,
  settingsUpdateSchema,
  type AdminSettingsDto,
} from '@foodlog/shared';
import { z } from 'zod';
import type { AppDeps } from '../app.ts';
import { featureFlags } from '../db/schema.ts';
import { parseBody } from '../lib/errors.ts';
import { listAudit, recordAudit } from '../services/audit.ts';
import { PUBLIC_REGISTRATION, getBooleanSetting, setBooleanSetting } from '../services/settings.ts';

export async function adminSettingsRoutes(app: FastifyInstance, { db }: AppDeps) {
  const admin = { preHandler: app.requireAdmin };

  async function settings(): Promise<AdminSettingsDto> {
    const rows = await db.select().from(featureFlags);
    return {
      publicRegistration: await getBooleanSetting(db, PUBLIC_REGISTRATION, false),
      features: FEATURE_KEYS.map((key) => {
        const row = rows.find((item) => item.key === key);
        return {
          key,
          enabled: row?.enabled ?? FEATURE_DEFAULTS[key].enabled,
          defaultForUsers: row?.defaultForUsers ?? FEATURE_DEFAULTS[key].defaultForUsers,
        };
      }),
    };
  }

  app.get('/api/admin/settings', admin, settings);

  app.patch('/api/admin/settings', admin, async (request) => {
    const body = parseBody(settingsUpdateSchema, request.body);
    await setBooleanSetting(db, PUBLIC_REGISTRATION, body.publicRegistration);
    await recordAudit(db, {
      actorId: request.user!.id,
      action: 'setting.public_registration',
      detail: String(body.publicRegistration),
    });
    return settings();
  });

  app.put('/api/admin/features/:key', admin, async (request) => {
    const { key } = parseBody(z.object({ key: featureKeySchema }), request.params);
    const body = parseBody(featureUpdateSchema, request.body);
    const [row] = await db.select().from(featureFlags).where(eq(featureFlags.key, key));
    const next = {
      enabled: body.enabled ?? row?.enabled ?? FEATURE_DEFAULTS[key].enabled,
      defaultForUsers:
        body.defaultForUsers ?? row?.defaultForUsers ?? FEATURE_DEFAULTS[key].defaultForUsers,
    };
    await db
      .insert(featureFlags)
      .values({ key, ...next })
      .onDuplicateKeyUpdate({ set: next });
    await recordAudit(db, {
      actorId: request.user!.id,
      action: 'feature.update',
      detail: `${key}: enabled=${next.enabled}, default=${next.defaultForUsers}`,
    });
    return settings();
  });

  app.get('/api/admin/audit', admin, async (request) => {
    const { limit } = parseBody(
      z.object({ limit: z.coerce.number().int().min(1).max(100).default(30) }),
      request.query,
    );
    return listAudit(db, limit);
  });
}
