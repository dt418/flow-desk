/**
 * Optional Sentry init — disabled when SENTRY_DSN is unset.
 * Uses Function constructor-style dynamic import string so TypeScript does not
 * require @sentry/node to be installed (optional dependency).
 */

import { env } from './env';

let initialized = false;

type SentryLike = {
  init: (opts: { dsn: string; environment?: string; tracesSampleRate?: number }) => void;
  captureException: (err: unknown) => void;
};

async function loadSentry(): Promise<SentryLike | null> {
  if (!env.SENTRY_DSN) return null;
  try {
    // Dynamic package name keeps tsc happy when @sentry/node is not installed
    const mod = ' @sentry/node'.trim();
    const loader = Function('m', 'return import(m)') as (m: string) => Promise<SentryLike>;
    const Sentry = await loader(mod).catch(() => null);
    return Sentry;
  } catch {
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
