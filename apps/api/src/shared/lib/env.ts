import 'dotenv/config';
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

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
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
  EMAIL_PROVIDER: z.enum(['nodemailer', 'resend']).default('nodemailer'),
  EMAIL_FROM: z.string().default('FlowDesk <noreply@flowdesk.local>'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  LLM_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  LLM_API_KEY: z.string().default('sk-placeholder'),
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
    .transform((v) => (v ? v === '1' || v === 'true' : false)),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
});

function normalizeEnv(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    out[k] = typeof v === 'string' && v.trim() === '' ? undefined : v;
  }
  return out;
}

const parsed = envSchema.safeParse(normalizeEnv(process.env));
if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

if (env.NODE_ENV === 'production') {
  if (env.EMAIL_PROVIDER === 'resend' && !env.RESEND_API_KEY) {
    console.warn(
      '[env] EMAIL_PROVIDER=resend but RESEND_API_KEY is not set — Resend send() calls will fail.',
    );
  }
  if (env.EMAIL_PROVIDER === 'nodemailer' && !env.SMTP_HOST) {
    console.warn(
      '[env] EMAIL_PROVIDER=nodemailer but SMTP_HOST is not set — SMTP send() calls will fail.',
    );
  }
}
