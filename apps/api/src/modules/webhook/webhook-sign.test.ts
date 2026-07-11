import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { signWebhookPayload } from './webhook-sign';

describe('signWebhookPayload (P1-4)', () => {
  it('returns sha256= hex digest of the body with the secret', () => {
    const secret = 'test-secret-32chars-min-length!!';
    const body = JSON.stringify({ action: 'TITLE_CHANGED', field: 'title', newValue: 'Hi' });
    const expected = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
    expect(signWebhookPayload(secret, body)).toBe(expected);
  });

  it('stringifies object bodies the same way as the worker (JSON.stringify)', () => {
    const secret = 'abc';
    const activity = { action: 'CREATED', newValue: 'Task' };
    const asString = signWebhookPayload(secret, JSON.stringify(activity));
    const asObject = signWebhookPayload(secret, activity);
    expect(asString).toBe(asObject);
    expect(asString.startsWith('sha256=')).toBe(true);
    expect(asString.length).toBe('sha256='.length + 64);
  });

  it('different secrets produce different signatures', () => {
    const body = '{"action":"MOVED"}';
    expect(signWebhookPayload('secret-a', body)).not.toBe(signWebhookPayload('secret-b', body));
  });

  it('different bodies produce different signatures', () => {
    const secret = 'same-secret';
    expect(signWebhookPayload(secret, '{"a":1}')).not.toBe(signWebhookPayload(secret, '{"a":2}'));
  });
});
