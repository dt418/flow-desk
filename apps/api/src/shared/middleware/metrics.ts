import type { MiddlewareHandler } from 'hono';
import { httpRequestsTotal, httpRequestDurationSeconds } from '../lib/metrics';

/**
 * Records request count + latency histogram for Prometheus.
 */
export const metricsMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const start = process.hrtime.bigint();
    try {
      await next();
    } finally {
      const end = process.hrtime.bigint();
      const seconds = Number(end - start) / 1e9;
      const method = c.req.method;
      // Prefer matched route path; fall back to pathname
      const route = c.req.routePath || new URL(c.req.url).pathname;
      const status = String(c.res.status);
      httpRequestsTotal.inc({ method, route, status });
      httpRequestDurationSeconds.observe({ method, route, status }, seconds);
    }
  };
};
