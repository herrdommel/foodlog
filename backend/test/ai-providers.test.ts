import { describe, expect, it } from 'vitest';
import {
  createAnthropicProvider,
  createMockProvider,
  createOpenAiProvider,
  createProviders,
  ProviderError,
  type ProviderErrorKind,
} from '../src/services/ai/providers.ts';

interface Call {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
}

function stub(respond: (call: Call) => Response | Promise<Response> | never) {
  const calls: Call[] = [];
  const fetchStub = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : null;
    const raw = request ? await request.text() : init?.body;
    const call: Call = {
      url: String(request?.url ?? input),
      method: (request?.method ?? init?.method ?? 'GET').toUpperCase(),
      headers: new Headers(request?.headers ?? init?.headers),
      body: typeof raw === 'string' && raw ? JSON.parse(raw) : undefined,
    };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
  return { fetchStub, calls };
}

const fast = { 'retry-after-ms': '1' };

function errorResponse(status: number) {
  return Response.json(
    { type: 'error', error: { type: 'x', message: 'nope' } },
    { status, headers: fast },
  );
}

async function kindOf(promise: Promise<unknown>): Promise<ProviderErrorKind | 'resolved'> {
  try {
    await promise;
    return 'resolved';
  } catch (error) {
    if (error instanceof ProviderError) return error.kind;
    throw error;
  }
}

const anthropicMessage = (overrides: object = {}) => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-test',
  content: [{ type: 'text', text: 'Hello from Claude' }],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: { input_tokens: 1, output_tokens: 1 },
  ...overrides,
});

describe('anthropic provider', () => {
  it('lists models with the key and sorts them', async () => {
    const { fetchStub, calls } = stub(() =>
      Response.json({
        data: [
          { id: 'claude-b', type: 'model', display_name: 'B', created_at: '2026-01-01T00:00:00Z' },
          { id: 'claude-a', type: 'model', display_name: 'A', created_at: '2026-01-01T00:00:00Z' },
        ],
        has_more: false,
        first_id: 'claude-b',
        last_id: 'claude-a',
      }),
    );
    const models = await createAnthropicProvider(fetchStub).listModels('sk-ant-key');
    expect(models).toEqual(['claude-a', 'claude-b']);
    expect(calls[0]?.url).toContain('/v1/models');
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer sk-ant-key');
  });

  it('sends system prompt and data as a single user message and returns the text', async () => {
    const { fetchStub, calls } = stub(() => Response.json(anthropicMessage()));
    const text = await createAnthropicProvider(fetchStub).generate({
      apiKey: 'sk-ant-key',
      model: 'claude-test',
      system: 'SYSTEM',
      user: 'USER DATA',
    });
    expect(text).toBe('Hello from Claude');
    expect(calls[0]?.url).toContain('/v1/messages');
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer sk-ant-key');
    expect(calls[0]?.body).toMatchObject({
      model: 'claude-test',
      system: 'SYSTEM',
      messages: [{ role: 'user', content: 'USER DATA' }],
    });
    expect((calls[0]?.body as { max_tokens: number }).max_tokens).toBeGreaterThanOrEqual(4000);
    expect(calls[0]?.body).not.toHaveProperty('thinking');
    expect(calls[0]?.body).not.toHaveProperty('temperature');
  });

  it('sends an image as a base64 block in front of the text, without retrying', async () => {
    const { fetchStub, calls } = stub(() => Response.json(anthropicMessage()));
    await createAnthropicProvider(fetchStub).generate({
      apiKey: 'sk-ant-key',
      model: 'claude-test',
      system: 'SYSTEM',
      user: 'WHAT IS THIS',
      image: { mediaType: 'image/jpeg', base64: 'QUJD' },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toMatchObject({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } },
            { type: 'text', text: 'WHAT IS THIS' },
          ],
        },
      ],
    });
  });

  it('joins several text blocks and ignores others', async () => {
    const { fetchStub } = stub(() =>
      Response.json(
        anthropicMessage({
          content: [
            { type: 'thinking', thinking: 'hidden', signature: 'sig' },
            { type: 'text', text: 'One' },
            { type: 'text', text: 'Two' },
          ],
        }),
      ),
    );
    const text = await createAnthropicProvider(fetchStub).generate({
      apiKey: 'k12345678',
      model: 'm',
      system: 's',
      user: 'u',
    });
    expect(text).toBe('One\nTwo');
  });

  it('sends an image as a data url input without storing it at OpenAI', async () => {
    const { fetchStub, calls } = stub(() => Response.json(openAiResponse()));
    await createOpenAiProvider(fetchStub).generate({
      apiKey: 'sk-key',
      model: 'gpt-test',
      system: 'SYSTEM',
      user: 'WHAT IS THIS',
      image: { mediaType: 'image/jpeg', base64: 'QUJD' },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toMatchObject({
      instructions: 'SYSTEM',
      store: false,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'WHAT IS THIS' },
            { type: 'input_image', image_url: 'data:image/jpeg;base64,QUJD' },
          ],
        },
      ],
    });
  });

  it.each([
    [401, 'invalid_key'],
    [403, 'invalid_key'],
    [404, 'invalid_model'],
    [429, 'rate_limited'],
    [500, 'failed'],
  ] as const)('maps HTTP %i to %s', async (status, kind) => {
    const { fetchStub } = stub(() => errorResponse(status));
    const provider = createAnthropicProvider(fetchStub);
    expect(
      await kindOf(provider.generate({ apiKey: 'k12345678', model: 'm', system: 's', user: 'u' })),
    ).toBe(kind);
  });

  it('maps a refusal, an empty answer and network failures', async () => {
    const refusal = stub(() =>
      Response.json(
        anthropicMessage({
          content: [],
          stop_reason: 'refusal',
          stop_details: { type: 'refusal', category: null },
        }),
      ),
    );
    const input = { apiKey: 'k12345678', model: 'm', system: 's', user: 'u' };
    expect(await kindOf(createAnthropicProvider(refusal.fetchStub).generate(input))).toBe(
      'refused',
    );

    const empty = stub(() => Response.json(anthropicMessage({ content: [] })));
    expect(await kindOf(createAnthropicProvider(empty.fetchStub).generate(input))).toBe('failed');

    const down = stub(() => {
      throw new TypeError('fetch failed');
    });
    expect(await kindOf(createAnthropicProvider(down.fetchStub).generate(input))).toBe(
      'unreachable',
    );
    expect(await kindOf(createAnthropicProvider(down.fetchStub).listModels('k12345678'))).toBe(
      'unreachable',
    );
  });

  it('does not leak the key or the prompt in provider errors', async () => {
    const { fetchStub } = stub(() => errorResponse(500));
    try {
      await createAnthropicProvider(fetchStub).generate({
        apiKey: 'sk-ant-SECRET-KEY',
        model: 'm',
        system: 'SECRET SYSTEM',
        user: 'SECRET USER',
      });
    } catch (error) {
      const text = JSON.stringify(error, Object.getOwnPropertyNames(error));
      expect(text).not.toContain('SECRET');
    }
  });
});

const openAiResponse = (overrides: object = {}) => ({
  id: 'resp_1',
  object: 'response',
  created_at: 1,
  status: 'completed',
  model: 'gpt-test',
  output: [
    {
      type: 'message',
      id: 'msg_1',
      status: 'completed',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'Hello from OpenAI', annotations: [] }],
    },
  ],
  ...overrides,
});

describe('openai provider', () => {
  it('lists only chat-capable models', async () => {
    const { fetchStub, calls } = stub(() =>
      Response.json({
        object: 'list',
        data: [
          'gpt-b',
          'gpt-a',
          'o3-mini',
          'text-embedding-3-large',
          'whisper-1',
          'dall-e-3',
          'gpt-image-1',
          'gpt-4o-realtime-preview',
          'gpt-4o-transcribe',
          'omni-moderation-latest',
          'davinci-002',
          'tts-1',
        ].map((id) => ({ id, object: 'model', created: 1, owned_by: 'openai' })),
      }),
    );
    const models = await createOpenAiProvider(fetchStub).listModels('sk-key');
    expect(models).toEqual(['gpt-a', 'gpt-b', 'o3-mini']);
    expect(calls[0]?.url).toContain('/models');
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer sk-key');
  });

  it('uses the responses endpoint without storing the data at OpenAI', async () => {
    const { fetchStub, calls } = stub(() => Response.json(openAiResponse()));
    const text = await createOpenAiProvider(fetchStub).generate({
      apiKey: 'sk-key',
      model: 'gpt-test',
      system: 'SYSTEM',
      user: 'USER DATA',
    });
    expect(text).toBe('Hello from OpenAI');
    expect(calls[0]?.url).toContain('/responses');
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer sk-key');
    expect(calls[0]?.body).toMatchObject({
      model: 'gpt-test',
      instructions: 'SYSTEM',
      input: 'USER DATA',
      store: false,
    });
  });

  it.each([
    [401, 'invalid_key'],
    [403, 'invalid_key'],
    [404, 'invalid_model'],
    [429, 'rate_limited'],
    [500, 'failed'],
  ] as const)('maps HTTP %i to %s', async (status, kind) => {
    const { fetchStub } = stub(() =>
      Response.json({ error: { message: 'nope' } }, { status, headers: fast }),
    );
    const provider = createOpenAiProvider(fetchStub);
    expect(
      await kindOf(provider.generate({ apiKey: 'k12345678', model: 'm', system: 's', user: 'u' })),
    ).toBe(kind);
  });

  it('maps refusals, failed responses, empty answers and network failures', async () => {
    const input = { apiKey: 'k12345678', model: 'm', system: 's', user: 'u' };
    const refusal = stub(() =>
      Response.json(
        openAiResponse({
          output: [
            {
              type: 'message',
              id: 'msg_1',
              status: 'completed',
              role: 'assistant',
              content: [{ type: 'refusal', refusal: 'I cannot help with that' }],
            },
          ],
        }),
      ),
    );
    expect(await kindOf(createOpenAiProvider(refusal.fetchStub).generate(input))).toBe('refused');

    const empty = stub(() => Response.json(openAiResponse({ output: [] })));
    expect(await kindOf(createOpenAiProvider(empty.fetchStub).generate(input))).toBe('failed');

    const down = stub(() => {
      throw new TypeError('fetch failed');
    });
    expect(await kindOf(createOpenAiProvider(down.fetchStub).generate(input))).toBe('unreachable');
  });
});

describe('request retries', () => {
  const input = { apiKey: 'k12345678', model: 'm', system: 's', user: 'u' };

  it.each([429, 500, 502])('never repeats a generation request after HTTP %i', async (status) => {
    for (const make of [createAnthropicProvider, createOpenAiProvider]) {
      const { fetchStub, calls } = stub(() =>
        Response.json({ error: { message: 'x' } }, { status, headers: fast }),
      );
      await kindOf(make(fetchStub).generate(input));
      expect(calls, `${make.name} after ${status}`).toHaveLength(1);
    }
  });

  it('never repeats a generation request after a network failure', async () => {
    for (const make of [createAnthropicProvider, createOpenAiProvider]) {
      const { fetchStub, calls } = stub(() => {
        throw new TypeError('fetch failed');
      });
      expect(await kindOf(make(fetchStub).generate(input))).toBe('unreachable');
      expect(calls, make.name).toHaveLength(1);
    }
  });

  it('may retry harmless model listing once', async () => {
    for (const make of [createAnthropicProvider, createOpenAiProvider]) {
      const { fetchStub, calls } = stub(() =>
        Response.json({ error: { message: 'x' } }, { status: 500, headers: fast }),
      );
      expect(await kindOf(make(fetchStub).listModels('k12345678'))).toBe('failed');
      expect(calls, make.name).toHaveLength(2);
    }
  });
});

describe('mock provider', () => {
  it('answers deterministically and simulates failures by key', async () => {
    const provider = createMockProvider();
    expect(await provider.listModels('anything')).toEqual(['mock-large', 'mock-small']);
    const text = await provider.generate({
      apiKey: 'anything',
      model: 'mock-large',
      system: 's',
      user: '{"entryCount":12}',
    });
    expect(text).toContain('12 diary entries');
    for (const [key, kind] of [
      ['mock-invalid', 'invalid_key'],
      ['mock-ratelimit', 'rate_limited'],
      ['mock-refuse', 'refused'],
      ['mock-down', 'unreachable'],
      ['mock-broken', 'failed'],
    ] as const) {
      expect(await kindOf(provider.listModels(key))).toBe(kind);
    }
  });

  it('is selected by the factory only when requested', () => {
    const mocked = createProviders({ mock: true });
    expect(mocked.anthropic).toBe(mocked.openai);
    const real = createProviders({ mock: false });
    expect(real.anthropic).not.toBe(real.openai);
  });
});
