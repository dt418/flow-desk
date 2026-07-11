import { describe, it, expect } from 'vitest';
import { renderMetrics, httpRequestsTotal, llmLatencySeconds, metricsRegistry } from './metrics';

describe('metrics (P2-3)', () => {
  it('renderMetrics includes http_requests_total and llm_latency_seconds_bucket', async () => {
    httpRequestsTotal.inc({ method: 'GET', route: '/api/health', status: '200' });
    llmLatencySeconds.observe({ operation: 'chat' }, 0.42);

    const body = await renderMetrics();
    expect(body).toContain('http_requests_total');
    expect(body).toContain('llm_latency_seconds_bucket');
    expect(body).toContain('# TYPE http_requests_total counter');
  });

  it('registry content type is prometheus text', () => {
    expect(metricsRegistry.contentType).toMatch(/text\/plain/);
  });
});
