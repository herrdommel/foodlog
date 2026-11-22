import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('127.0.0.1'),
  APP_URL: z.url(),
  DATABASE_URL: z.string().min(1),
  API_KEY_ENCRYPTION_KEY: z
    .string()
    .refine((value) => Buffer.from(value, 'base64').length === 32, 'must be 32 bytes, base64'),
  API_KEY_ENCRYPTION_KEY_PREVIOUS: z.string().optional(),
  AI_MOCK_PROVIDER: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  LEGAL_DIR: z.string().default('./legal'),
  OPEN_FOOD_FACTS_URL: z.url().default('https://world.openfoodfacts.org'),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
});

export type Config = z.infer<typeof envSchema>;

function decodeKey(value: string): Buffer {
  return Buffer.from(value, 'base64');
}

export function encryptionKeys(config: Config): { active: Buffer; previous: Buffer[] } {
  const previous = (config.API_KEY_ENCRYPTION_KEY_PREVIOUS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map(decodeKey);
  if (previous.some((key) => key.length !== 32)) {
    throw new Error('API_KEY_ENCRYPTION_KEY_PREVIOUS must contain 32 byte base64 keys');
  }
  return { active: decodeKey(config.API_KEY_ENCRYPTION_KEY), previous };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.AI_MOCK_PROVIDER) {
    throw new Error('AI_MOCK_PROVIDER must not be enabled in production');
  }
  encryptionKeys(parsed.data);
  return parsed.data;
}
