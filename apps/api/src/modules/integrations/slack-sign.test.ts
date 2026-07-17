import { createHmac } from 'crypto';
import { describe, it, expect } from 'vitest';
import { verifySlackSignature } from './slack-sign';

function sign(secret: string, timestamp: string, body: string): string {
  const base = `v0:${timestamp}:${body}`;
  return `v0=${createHmac('sha256', secret).update(base).digest('hex')}`;
}

describe('verifySlackSignature', () => {
  const secret = 'test-signing-secret';
  const body = 'token=xyz&text=hello';
  const ts = '1609459200'; // fixed

  it('accepts a valid signature', () => {
    const sig = sign(secret, ts, body);
    expect(
      verifySlackSignature({
        signingSecret: secret,
        signatureHeader: sig,
        timestampHeader: ts,
        rawBody: body,
        nowSec: Number(ts),
      }),
    ).toBe(true);
  });

  it('rejects a bad signature', () => {
    expect(
      verifySlackSignature({
        signingSecret: secret,
        signatureHeader: 'v0=deadbeef',
        timestampHeader: ts,
        rawBody: body,
        nowSec: Number(ts),
      }),
    ).toBe(false);
  });

  it('rejects stale timestamps (>5 min)', () => {
    const sig = sign(secret, ts, body);
    expect(
      verifySlackSignature({
        signingSecret: secret,
        signatureHeader: sig,
        timestampHeader: ts,
        rawBody: body,
        nowSec: Number(ts) + 301,
      }),
    ).toBe(false);
  });

  it('rejects missing headers', () => {
    expect(
      verifySlackSignature({
        signingSecret: secret,
        signatureHeader: undefined,
        timestampHeader: ts,
        rawBody: body,
        nowSec: Number(ts),
      }),
    ).toBe(false);
  });
});
