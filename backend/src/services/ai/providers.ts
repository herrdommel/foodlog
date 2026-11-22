import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { AiProviderId } from '@foodlog/shared';

export type ProviderErrorKind =
  'invalid_key' | 'invalid_model' | 'rate_limited' | 'refused' | 'unreachable' | 'failed';

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;

  constructor(kind: ProviderErrorKind) {
    super(kind);
    this.kind = kind;
  }
}

export interface ImageInput {
  mediaType: 'image/jpeg';
  base64: string;
}

export interface GenerateInput {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  image?: ImageInput;
}

export interface AiProvider {
  listModels(apiKey: string): Promise<string[]>;
  generate(input: GenerateInput): Promise<string>;
}

export type AiProviders = Record<AiProviderId, AiProvider>;

// Must stay below the proxy timeout in deploy/nginx.conf.example (150 s). Generating is never retried,
// otherwise a slow answer could be requested (and billed to the user's key) twice.
const TIMEOUT_MS = 100_000;
const MAX_TOKENS = 16_000;

type Fetch = typeof fetch;

function anthropicError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return new ProviderError('invalid_key');
  }
  if (error instanceof Anthropic.NotFoundError) return new ProviderError('invalid_model');
  if (error instanceof Anthropic.RateLimitError) return new ProviderError('rate_limited');
  if (error instanceof Anthropic.APIConnectionError) return new ProviderError('unreachable');
  return new ProviderError('failed');
}

function openAiError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  if (
    error instanceof OpenAI.AuthenticationError ||
    error instanceof OpenAI.PermissionDeniedError
  ) {
    return new ProviderError('invalid_key');
  }
  if (error instanceof OpenAI.NotFoundError) return new ProviderError('invalid_model');
  if (error instanceof OpenAI.RateLimitError) return new ProviderError('rate_limited');
  if (error instanceof OpenAI.APIConnectionError) return new ProviderError('unreachable');
  return new ProviderError('failed');
}

export function createAnthropicProvider(fetchImpl?: Fetch): AiProvider {
  const client = (apiKey: string, maxRetries: number) =>
    new Anthropic({ apiKey, maxRetries, timeout: TIMEOUT_MS, fetch: fetchImpl });

  return {
    async listModels(apiKey) {
      try {
        const ids: string[] = [];
        for await (const model of client(apiKey, 1).models.list()) ids.push(model.id);
        return ids.sort();
      } catch (error) {
        throw anthropicError(error);
      }
    },

    async generate({ apiKey, model, system, user, image }) {
      try {
        const message = await client(apiKey, 0).messages.create({
          model,
          max_tokens: MAX_TOKENS,
          system,
          messages: [
            {
              role: 'user',
              content: image
                ? [
                    {
                      type: 'image',
                      source: { type: 'base64', media_type: image.mediaType, data: image.base64 },
                    },
                    { type: 'text', text: user },
                  ]
                : user,
            },
          ],
        });
        if (message.stop_reason === 'refusal') throw new ProviderError('refused');
        const text = message.content
          .flatMap((block) => (block.type === 'text' ? [block.text] : []))
          .join('\n')
          .trim();
        if (!text) throw new ProviderError('failed');
        return text;
      } catch (error) {
        throw anthropicError(error);
      }
    },
  };
}

const OPENAI_NON_CHAT =
  /(embedding|whisper|tts|dall-e|image|audio|realtime|transcribe|moderation|search|computer-use|codex|davinci|babbage|instruct)/i;

export function createOpenAiProvider(fetchImpl?: Fetch): AiProvider {
  const client = (apiKey: string, maxRetries: number) =>
    new OpenAI({ apiKey, maxRetries, timeout: TIMEOUT_MS, fetch: fetchImpl });

  return {
    async listModels(apiKey) {
      try {
        const ids: string[] = [];
        for await (const model of client(apiKey, 1).models.list()) ids.push(model.id);
        return ids
          .filter((id) => /^(gpt|o\d|chatgpt)/i.test(id) && !OPENAI_NON_CHAT.test(id))
          .sort();
      } catch (error) {
        throw openAiError(error);
      }
    },

    async generate({ apiKey, model, system, user, image }) {
      try {
        const response = await client(apiKey, 0).responses.create({
          model,
          instructions: system,
          input: image
            ? [
                {
                  role: 'user',
                  content: [
                    { type: 'input_text', text: user },
                    {
                      type: 'input_image',
                      image_url: `data:${image.mediaType};base64,${image.base64}`,
                      detail: 'auto',
                    },
                  ],
                },
              ]
            : user,
          store: false,
        });
        const refused = response.output.some(
          (item) => item.type === 'message' && item.content.some((part) => part.type === 'refusal'),
        );
        const text = response.output_text.trim();
        if (!text && refused) throw new ProviderError('refused');
        if (!text || response.status === 'failed') throw new ProviderError('failed');
        return text;
      } catch (error) {
        throw openAiError(error);
      }
    },
  };
}

export const MOCK_MODELS = ['mock-large', 'mock-small'];

export function createMockProvider(): AiProvider {
  const check = (apiKey: string) => {
    const behaviours: Record<string, ProviderErrorKind> = {
      'mock-invalid': 'invalid_key',
      'mock-ratelimit': 'rate_limited',
      'mock-refuse': 'refused',
      'mock-down': 'unreachable',
      'mock-broken': 'failed',
    };
    const kind = behaviours[apiKey];
    if (kind) throw new ProviderError(kind);
  };

  return {
    async listModels(apiKey) {
      check(apiKey);
      return MOCK_MODELS;
    },

    async generate({ apiKey, model, user, image }) {
      check(apiKey);
      if (image) {
        return JSON.stringify({
          items: [
            { key: 'milk', name: 'Milk' },
            { key: 'rice', name: 'Rice' },
            { key: null, name: 'Dragon fruit' },
          ],
        });
      }
      const entries = /"entryCount":\s*(\d+)/.exec(user)?.[1] ?? '0';
      return `MOCK ANALYSIS (${model})\n\nThis is a simulated answer. The request contained ${entries} diary entries.`;
    },
  };
}

export function createProviders(options: { mock: boolean; fetch?: Fetch }): AiProviders {
  if (options.mock) {
    const mock = createMockProvider();
    return { anthropic: mock, openai: mock };
  }
  return {
    anthropic: createAnthropicProvider(options.fetch),
    openai: createOpenAiProvider(options.fetch),
  };
}
