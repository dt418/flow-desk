import { createHmac } from 'crypto';

/**
 * HMAC-SHA256 body signature for outbound webhook deliveries.
 * Header value format: `sha256=<hex>`.
 * Exported pure function so unit tests and the BullMQ worker share one implementation.
 */
export function signWebhookPayload(secret: string, body: string | unknown): string {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  const digest = createHmac('sha256', secret).update(payload).digest('hex');
  return `sha256=${digest}`;
}
