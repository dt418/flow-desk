/**
 * Optional Sentry init — disabled when SENTRY_DSN is unset.
 * Prefers a real `@sentry/node` dependency; warns once if DSN is set but the
 * package cannot be loaded (silent no-op is worse than a clear operator signal).
 */

import { env } from './env';
import { logger } from './logger';

let initialized = false;
let warnedMissing = false;

type SentryLike = {
  init: (opts: { dsn: string; environment?: string; tracesSampleRate?: number }) => void;
  captureException: (err: unknown) => void;
};

async function loadSentry(): Promise<SentryLike | null> {
  if (!env.SENTRY_DSN) return null;
  try {
    const mod = await import('@sentry/node');
    return mod as unknown as SentryLike;
  } catch {
    if (!warnedMissing) {
      warnedMissing = true;
      logger.warn(
        'SENTRY_DSN is set but @sentry/node failed to load — install with: pnpm --filter @flow-desk/api add @sentry/node',
      );
    }
    return null;
  }
}

export async function initSentry(): Promise<void> {
  const dsn = env.SENTRY_DSN;
  if (!dsn || initialized) return;
  const Sentry = await loadSentry();
  if (!Sentry) return;
  Sentry.init({
    dsn,
    environment: env.NODE_ENV,
    tracesSampleRate: 0.1,
  });
  initialized = true;
}

export async function captureException(err: unknown): Promise<void> {
  if (!env.SENTRY_DSN) return;
  const Sentry = await loadSentry();
  if (Sentry) Sentry.captureException(err);
}
