import { api } from '@/lib/api';
import { env } from '@/lib/env';

// ponytail: JS-readable socket auth token. Held in memory only (no httpOnly
// cookie) and passed to the socket handshake as `auth:{ token }`. Refetched
// lazily when missing or within the refresh margin of expiry.
interface CachedSocketToken {
  token: string;
  expMs: number;
}

let cached: CachedSocketToken | null = null;

const REFRESH_MARGIN_MS = 60 * 1000;

function jwtExpMs(token: string): number | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

async function fetchSocketToken(): Promise<string> {
  const data = await api<{ token: string; expiresAt: number | null }>('/api/auth/socket-token');
  const expMs = data.expiresAt ?? jwtExpMs(data.token) ?? 0;
  cached = { token: data.token, expMs };
  return data.token;
}

export async function getSocketToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.token && cached.expMs - REFRESH_MARGIN_MS > now) {
    return cached.token;
  }
  return fetchSocketToken();
}

export function clearSocketToken(): void {
  cached = null;
}

// Keep a fresh token so a socket (re)connect always has a valid handshake
// token without waiting for the first connect to fetch one.
let prefetchTimer: ReturnType<typeof setInterval> | null = null;

export function ensureSocketTokenPrefetch(): void {
  if (prefetchTimer !== null) return;
  prefetchTimer = setInterval(
    () => {
      void getSocketToken().catch(() => {});
    },
    5 * 60 * 1000,
  );
}

export const SOCKET_API_URL = env.VITE_API_URL;
