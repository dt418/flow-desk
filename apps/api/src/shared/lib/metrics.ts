import { Registry, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';

/** Shared Prometheus registry for FlowDesk API. */
export const metricsRegistry = new Registry();

collectDefaultMetrics({ register: metricsRegistry, prefix: 'flowdesk_' });

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [metricsRegistry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export const llmLatencySeconds = new Histogram({
  name: 'llm_latency_seconds',
  help: 'LLM provider call latency in seconds',
  labelNames: ['operation'] as const,
  buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
  registers: [metricsRegistry],
});

export const bullmqQueueDepth = new Gauge({
  name: 'bullmq_queue_depth',
  help: 'Approximate BullMQ waiting job count',
  labelNames: ['queue'] as const,
  registers: [metricsRegistry],
});

export const socketConnections = new Gauge({
  name: 'socket_io_connections',
  help: 'Active Socket.IO connections',
  registers: [metricsRegistry],
});

export async function renderMetrics(): Promise<string> {
  return metricsRegistry.metrics();
}
