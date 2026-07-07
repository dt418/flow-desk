import { z } from 'zod';

const TTL_UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86_400,
  w: 604_800,
  y: 31_536_000,
};

function parseTtlToSeconds(ttl: string): number | null {
  const match = ttl.trim().match(/^(\d+(?:\.\d+)?)\s*([smhdwy])?$/);
  if (!match || match[1] === undefined) return null;
  const value = parseFloat(match[1]);
  const unit = match[2] ?? 's';
  const multiplier = TTL_UNIT_SECONDS[unit];
  if (multiplier === undefined) return null;
  return value * multiplier;
}

function isPositiveTtl(ttl: string): boolean {
  const seconds = parseTtlToSeconds(ttl);
  return seconds !== null && seconds > 0;
}

const sharedFields = {
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
};

export const backendSchema = z.object({
  ...sharedFields,
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  JWT_SECRET: z
    .string()
    .min(32)
    .refine((secret) => {
      if (process.env.NODE_ENV === 'production') {
        const KNOWN_DEFAULTS = ['change-me-to-a-32-char-random-string-please'];
        return !KNOWN_DEFAULTS.includes(secret);
      }
      return true;
    }, 'JWT_SECRET must not be the default placeholder in production'),
  JWT_ACCESS_TTL: z
    .string()
    .default('15m')
    .refine(isPositiveTtl, 'JWT_ACCESS_TTL must be a positive, non-zero duration (e.g. "15m")'),
  JWT_REFRESH_TTL: z
    .string()
    .default('7d')
    .refine(isPositiveTtl, 'JWT_REFRESH_TTL must be a positive, non-zero duration (e.g. "7d")'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173,http://localhost:3000')
    .transform((s) => s.split(',').map((o) => o.trim())),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  FLOWDESK_GITHUB_CLIENT_ID: z.string().optional(),
  FLOWDESK_GITHUB_CLIENT_SECRET: z.string().optional(),
  FLOWDESK_GITHUB_REDIRECT_URI: z.string().url().optional(),
  LLM_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  LLM_API_KEY: z
    .string()
    .refine((key) => {
      const PLACEHOLDERS = ['', 'sk-placeholder', 'your-key-here', 'changeme'];
      return !PLACEHOLDERS.includes(key.trim().toLowerCase());
    }, 'LLM_API_KEY must be set to a real key (no placeholder/default allowed)'),
  LLM_MODEL: z.string().default('gpt-4o-mini'),
  LLM_MAX_TOKENS: z.coerce.number().int().min(1).default(2048),
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),
  UPLOAD_DIR: z.string().default('/data/attachments'),
  MAX_UPLOAD_SIZE: z.coerce
    .number()
    .int()
    .default(25 * 1024 * 1024),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  SKIP_RATE_LIMIT: z
    .string()
    .optional()
    .transform((v) => v === '1' || v === 'true'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
});

export type BackendEnv = z.infer<typeof backendSchema>;

export function parseBackendEnv(env: Record<string, string | undefined>): BackendEnv {
  return backendSchema.parse(env);
}
