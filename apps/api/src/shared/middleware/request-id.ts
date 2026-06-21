import type { Context, Next } from 'hono';

export function requestId() {
  return async (c: Context, next: Next) => {
    const id = crypto.randomUUID();
    c.set('requestId', id);
    c.header('X-Request-Id', id);
    await next();
  };
}
