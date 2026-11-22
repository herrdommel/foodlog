import { eq, and } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  AI_CONSENT_VERSION,
  AI_PHOTO_CONSENT_VERSION,
  aiConsentSchema,
  aiPhotoConsentSchema,
  aiKeySchema,
  aiProviderSchema,
  aiRunSchema,
  aiSettingsUpdateSchema,
  type AiModelsDto,
  type AiPhotoResultDto,
  type AiProviderId,
  type AiResultDto,
  type AiSettingsDto,
} from '@foodlog/shared';
import { z } from 'zod';
import type { AppDeps } from '../app.ts';
import { encryptionKeys } from '../config.ts';
import { aiKeys, aiSettings } from '../db/schema.ts';
import { AppError, parseBody } from '../lib/errors.ts';
import { createSecretBox } from '../lib/secret-box.ts';
import { buildAiRequest, toPreview } from '../services/ai/payload.ts';
import { parsePhotoAnswer, PHOTO_SYSTEM, PHOTO_USER, prepareImage } from '../services/ai/photo.ts';
import { resolveCandidates } from '../services/suggestions.ts';
import { ProviderError, type AiProviders } from '../services/ai/providers.ts';

const MAX_ANSWER_LENGTH = 20_000;
const SUGGESTED: Partial<Record<AiProviderId, string>> = { anthropic: 'claude-opus-5-5' };

function providerFailure(error: unknown): AppError {
  if (!(error instanceof ProviderError))
    return new AppError(502, 'ai_failed', 'The AI request failed');
  switch (error.kind) {
    case 'invalid_key':
      return new AppError(400, 'invalid_api_key', 'The provider rejected the API key');
    case 'invalid_model':
      return new AppError(400, 'invalid_model', 'The provider does not know this model');
    case 'rate_limited':
      return new AppError(429, 'ai_rate_limited', 'The provider rate limit was reached');
    case 'refused':
      return new AppError(422, 'ai_refused', 'The provider declined to answer');
    case 'unreachable':
      return new AppError(502, 'provider_unreachable', 'The provider could not be reached');
    default:
      return new AppError(502, 'ai_failed', 'The AI request failed');
  }
}

export async function aiRoutes(
  app: FastifyInstance,
  { config, db, aiProviders }: AppDeps & { aiProviders: AiProviders },
) {
  const box = createSecretBox(encryptionKeys(config));
  const guard = { preHandler: [app.requireUser, app.requireFeature('ai_analysis')] };
  const photoGuard = {
    preHandler: [
      app.requireUser,
      app.requireFeature('ai_analysis'),
      app.requireFeature('ai_photo'),
    ],
  };
  const limited = (max: number) => ({
    ...guard,
    config: { rateLimit: { max, timeWindow: '1 minute' } },
  });
  const context = (userId: string, provider: AiProviderId) => `${userId}:${provider}`;

  async function settingsFor(userId: string): Promise<AiSettingsDto> {
    const [[settings], keys] = await Promise.all([
      db.select().from(aiSettings).where(eq(aiSettings.userId, userId)),
      db.select().from(aiKeys).where(eq(aiKeys.userId, userId)),
    ]);
    const keyInfo = (provider: AiProviderId) => {
      const row = keys.find((item) => item.provider === provider);
      return { configured: Boolean(row), last4: row?.last4 ?? null };
    };
    const consentGiven = settings?.consentVersion === AI_CONSENT_VERSION;
    const photoConsentGiven = settings?.photoConsentVersion === AI_PHOTO_CONSENT_VERSION;
    return {
      provider: settings?.provider ?? null,
      model: settings?.model ?? null,
      keys: { anthropic: keyInfo('anthropic'), openai: keyInfo('openai') },
      consent: {
        given: consentGiven,
        version: settings?.consentVersion ?? 0,
        currentVersion: AI_CONSENT_VERSION,
        at: consentGiven ? (settings?.consentAt?.toISOString() ?? null) : null,
      },
      photoConsent: {
        given: photoConsentGiven,
        at: photoConsentGiven ? (settings?.photoConsentAt?.toISOString() ?? null) : null,
      },
    };
  }

  async function updateSettings(
    userId: string,
    values: Partial<{
      provider: AiProviderId | null;
      model: string | null;
      consentVersion: number | null;
      consentAt: Date | null;
      photoConsentVersion: number | null;
      photoConsentAt: Date | null;
    }>,
  ) {
    await db
      .insert(aiSettings)
      .values({ userId, ...values })
      .onDuplicateKeyUpdate({ set: values });
  }

  async function storedKey(userId: string, provider: AiProviderId): Promise<string> {
    const [row] = await db
      .select()
      .from(aiKeys)
      .where(and(eq(aiKeys.userId, userId), eq(aiKeys.provider, provider)));
    if (!row)
      throw new AppError(409, 'ai_not_configured', 'No API key is stored for this provider');
    try {
      return box.decrypt(row.ciphertext, context(userId, provider));
    } catch {
      throw new AppError(409, 'key_unreadable', 'The stored API key can no longer be read');
    }
  }

  app.get('/api/ai/settings', guard, async (request) => settingsFor(request.user!.id));

  app.put('/api/ai/keys/:provider', limited(10), async (request) => {
    const { provider } = parseBody(z.object({ provider: aiProviderSchema }), request.params);
    const { apiKey } = parseBody(aiKeySchema, request.body);
    const userId = request.user!.id;
    try {
      await aiProviders[provider].listModels(apiKey);
    } catch (error) {
      throw providerFailure(error);
    }
    const values = {
      ciphertext: box.encrypt(apiKey, context(userId, provider)),
      last4: apiKey.slice(-4),
    };
    await db
      .insert(aiKeys)
      .values({ userId, provider, ...values })
      .onDuplicateKeyUpdate({ set: { ...values, createdAt: new Date() } });
    const current = await settingsFor(userId);
    if (!current.provider) await updateSettings(userId, { provider, model: null });
    return settingsFor(userId);
  });

  app.delete('/api/ai/keys/:provider', guard, async (request) => {
    const { provider } = parseBody(z.object({ provider: aiProviderSchema }), request.params);
    const userId = request.user!.id;
    await db.delete(aiKeys).where(and(eq(aiKeys.userId, userId), eq(aiKeys.provider, provider)));
    const current = await settingsFor(userId);
    if (current.provider === provider)
      await updateSettings(userId, { provider: null, model: null });
    return settingsFor(userId);
  });

  app.get('/api/ai/models', limited(20), async (request): Promise<AiModelsDto> => {
    const { provider } = parseBody(z.object({ provider: aiProviderSchema }), request.query);
    const apiKey = await storedKey(request.user!.id, provider);
    try {
      const models = await aiProviders[provider].listModels(apiKey);
      const suggested = SUGGESTED[provider];
      return { models, suggested: suggested && models.includes(suggested) ? suggested : null };
    } catch (error) {
      throw providerFailure(error);
    }
  });

  app.patch('/api/ai/settings', guard, async (request) => {
    const body = parseBody(aiSettingsUpdateSchema, request.body);
    const userId = request.user!.id;
    const current = await settingsFor(userId);
    const provider = body.provider === undefined ? current.provider : body.provider;
    if (provider && !current.keys[provider].configured) {
      throw new AppError(409, 'ai_not_configured', 'No API key is stored for this provider');
    }
    const providerChanged = body.provider !== undefined && body.provider !== current.provider;
    await updateSettings(userId, {
      provider,
      model: body.model !== undefined ? body.model : providerChanged ? null : current.model,
    });
    return settingsFor(userId);
  });

  app.post('/api/ai/consent', guard, async (request) => {
    parseBody(aiConsentSchema, request.body);
    await updateSettings(request.user!.id, {
      consentVersion: AI_CONSENT_VERSION,
      consentAt: new Date(),
    });
    return settingsFor(request.user!.id);
  });

  app.delete('/api/ai/consent', guard, async (request) => {
    await updateSettings(request.user!.id, { consentVersion: null, consentAt: null });
    return settingsFor(request.user!.id);
  });

  app.post('/api/ai/photo-consent', photoGuard, async (request) => {
    parseBody(aiPhotoConsentSchema, request.body);
    await updateSettings(request.user!.id, {
      photoConsentVersion: AI_PHOTO_CONSENT_VERSION,
      photoConsentAt: new Date(),
    });
    return settingsFor(request.user!.id);
  });

  app.delete('/api/ai/photo-consent', guard, async (request) => {
    await updateSettings(request.user!.id, { photoConsentVersion: null, photoConsentAt: null });
    return settingsFor(request.user!.id);
  });

  app.post(
    '/api/ai/photo',
    { ...photoGuard, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request): Promise<AiPhotoResultDto> => {
      const user = request.user!;
      const settings = await settingsFor(user.id);
      if (!settings.photoConsent.given) {
        throw new AppError(
          403,
          'photo_consent_required',
          'Consent is required before a photo is sent',
        );
      }
      if (!settings.provider || !settings.model) {
        throw new AppError(
          409,
          'ai_not_configured',
          'Choose a provider, a model and store a key first',
        );
      }
      const file = await request.file();
      if (!file) throw new AppError(400, 'file_required', 'No file uploaded');
      const image = await prepareImage(await file.toBuffer());
      const apiKey = await storedKey(user.id, settings.provider);
      try {
        const text = await aiProviders[settings.provider].generate({
          apiKey,
          model: settings.model,
          system: PHOTO_SYSTEM[user.locale],
          user: PHOTO_USER,
          image,
        });
        const suggestions = await resolveCandidates(db, user.id, parsePhotoAnswer(text));
        return { suggestions, provider: settings.provider, model: settings.model };
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw providerFailure(error);
      }
    },
  );

  app.post('/api/ai/preview', limited(20), async (request) =>
    toPreview(await buildAiRequest(db, request.user!, parseBody(aiRunSchema, request.body))),
  );

  app.post('/api/ai/analyze', limited(5), async (request): Promise<AiResultDto> => {
    const query = parseBody(aiRunSchema, request.body);
    const user = request.user!;
    const settings = await settingsFor(user.id);
    if (!settings.consent.given) {
      throw new AppError(403, 'consent_required', 'Consent is required before data is sent');
    }
    if (!settings.provider || !settings.model) {
      throw new AppError(
        409,
        'ai_not_configured',
        'Choose a provider, a model and store a key first',
      );
    }
    const apiKey = await storedKey(user.id, settings.provider);
    const aiRequest = await buildAiRequest(db, user, query);
    try {
      const text = await aiProviders[settings.provider].generate({
        apiKey,
        model: settings.model,
        system: aiRequest.system,
        user: aiRequest.user,
      });
      return {
        text: text.slice(0, MAX_ANSWER_LENGTH),
        provider: settings.provider,
        model: settings.model,
        payloadHash: aiRequest.payloadHash,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      throw providerFailure(error);
    }
  });
}
