import { createHash, randomBytes } from 'crypto';

const KEY_PREFIX = 'fdkey_';

export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function generateApiKey(): { raw: string; hashed: string; prefix: string } {
  const secret = randomBytes(24).toString('base64url');
  const raw = `${KEY_PREFIX}${secret}`;
  return {
    raw,
    hashed: hashApiKey(raw),
    prefix: raw.slice(0, 12),
  };
}

export { KEY_PREFIX };
