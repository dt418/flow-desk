import type { z } from 'zod';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions extends RequestInit {
  json?: unknown;
  schema?: z.ZodType;
}

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { json, schema, headers, ...rest } = options;

  const doFetch = async () => {
    const res = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...headers,
      },
      ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
      ...rest,
    });

    const contentType = res.headers.get('content-type') ?? '';
    const isJson = contentType.includes('application/json');
    const body = isJson ? await res.json().catch(() => null) : await res.text();

    if (!res.ok) {
      const message =
        isJson && body && typeof body === 'object' && 'message' in body
          ? String((body as { message: unknown }).message)
          : `Request failed with status ${res.status}`;
      throw new ApiError(res.status, body, message);
    }

    if (schema) {
      return schema.parse(body) as T;
    }

    return body as T;
  };

  try {
    return await doFetch();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      const ok = await tryRefresh();
      if (ok) return doFetch();
    }
    throw err;
  }
}
