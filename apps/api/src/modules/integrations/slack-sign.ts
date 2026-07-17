import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verify Slack slash-command / interactive request signatures.
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function verifySlackSignature(opts: {
  signingSecret: string;
  signatureHeader: string | undefined;
  timestampHeader: string | undefined;
  rawBody: string;
  nowSec?: number;
}): boolean {
  const { signingSecret, signatureHeader, timestampHeader, rawBody } = opts;
  if (!signatureHeader || !timestampHeader) return false;

  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts)) return false;

  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 300) return false;

  const base = `v0:${timestampHeader}:${rawBody}`;
  const digest = createHmac('sha256', signingSecret).update(base).digest('hex');
  const expected = `v0=${digest}`;

  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signatureHeader);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
