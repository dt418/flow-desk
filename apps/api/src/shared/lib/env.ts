import 'dotenv/config';
import { safeParseBackendEnv, type BackendEnv } from '@flowdesk/env';

const parsed = safeParseBackendEnv(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env: BackendEnv = parsed.data;
export type { BackendEnv };

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
  if (!env.METRICS_TOKEN) {
    console.warn(
      '[env] METRICS_TOKEN is unset — GET /metrics is publicly readable. Set METRICS_TOKEN in production.',
    );
  }
  if (!env.SENTRY_DSN) {
    console.warn('[env] SENTRY_DSN is unset — unhandled errors will not be reported to Sentry.');
  }
}
