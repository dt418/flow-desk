import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * AES-256-GCM ciphertext for OAuth access/refresh tokens at rest.
 * Same wire format as TOTP secret (`iv.tag.ciphertext` base64) but with a
 * separate key derivation domain so a leaked one doesn't compromise the other.
 */
function defaultJwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is required for OAuth token encryption');
  return s;
}

export function deriveIntegrationKey(secret: string = defaultJwtSecret()): Buffer {
  return createHash('sha256').update(`flowdesk-integration:${secret}`).digest();
}

export function encryptToken(plaintext: string, key: Buffer = deriveIntegrationKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

export function decryptToken(blob: string, key: Buffer = deriveIntegrationKey()): string {
  const [ivB64, tagB64, dataB64] = blob.split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Invalid encrypted token format');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return dec.toString('utf8');
}
