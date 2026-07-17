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

/** Empty strings from docker/env files become undefined so optional fields stay optional. */
export function normalizeEnv(
  input: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(input)) {
    out[k] = typeof v === 'string' && v.trim() === '' ? undefined : v;
  }
  return out;
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
  JWT_SOCKET_TTL: z
    .string()
    .default('15m')
    .refine(isPositiveTtl, 'JWT_SOCKET_TTL must be a positive, non-zero duration (e.g. "15m")'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173,http://localhost:3000')
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  /** Public app origin used in email links and absolute redirects. */
  APP_URL: z.string().url().default('http://localhost:3000'),

  // Google OAuth (optional)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),

  // GitHub OAuth (optional — reserved for future provider surface)
  FLOWDESK_GITHUB_CLIENT_ID: z.string().optional(),
  FLOWDESK_GITHUB_CLIENT_SECRET: z.string().optional(),
  FLOWDESK_GITHUB_REDIRECT_URI: z.string().url().optional(),

  // Slack OAuth + Events (optional)
  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),
  SLACK_REDIRECT_URI: z.string().url().optional(),
  SLACK_SIGNING_SECRET: z.string().optional(),

  // GitLab OAuth (optional)
  FLOWDESK_GITLAB_CLIENT_ID: z.string().optional(),
  FLOWDESK_GITLAB_CLIENT_SECRET: z.string().optional(),
  FLOWDESK_GITLAB_REDIRECT_URI: z.string().url().optional(),
  FLOWDESK_GITLAB_BASE_URL: z.string().url().default('https://gitlab.com'),

  // Email
  EMAIL_PROVIDER: z.enum(['nodemailer', 'resend']).default('nodemailer'),
  EMAIL_FROM: z.string().default('FlowDesk <noreply@flowdesk.local>'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),

  // LLM
  LLM_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  LLM_API_KEY: z.string().refine((key) => {
    const PLACEHOLDERS = ['', 'sk-placeholder', 'your-key-here', 'changeme'];
    return !PLACEHOLDERS.includes(key.trim().toLowerCase());
  }, 'LLM_API_KEY must be set to a real key (no placeholder/default allowed)'),
  LLM_MODEL: z.string().default('gpt-4o-mini'),
  LLM_MAX_TOKENS: z.coerce.number().int().min(1).default(2048),
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),

  // Uploads / ops
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

  /** Optional Sentry DSN — error capture disabled when unset. */
  SENTRY_DSN: z.string().url().optional(),
  /**
   * When set, GET /metrics requires `Authorization: Bearer <token>`.
   * Leave unset in local dev; set in production scrapes.
   */
  METRICS_TOKEN: z.string().min(16).optional(),

  /**
   * When true, outbound webhooks may target RFC1918 private IPs (self-hosted LAN).
   * Link-local / cloud metadata (169.254.0.0/16) is always blocked.
   */
  ALLOW_PRIVATE_WEBHOOK_URLS: z
    .string()
    .optional()
    .transform((v) => v === '1' || v === 'true'),
});

export type BackendEnv = z.infer<typeof backendSchema>;

export function parseBackendEnv(env: Record<string, string | undefined>): BackendEnv {
  return backendSchema.parse(normalizeEnv(env));
}

export function safeParseBackendEnv(env: Record<string, string | undefined>) {
  return backendSchema.safeParse(normalizeEnv(env));
}
