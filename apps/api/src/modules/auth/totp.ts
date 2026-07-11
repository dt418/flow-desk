import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';

/**
 * Derive a 32-byte AES key from JWT_SECRET for encrypting TOTP secrets at rest.
 * Pure crypto — no network / DB. Avoids importing prisma/env so unit tests stay lightweight.
 */
function defaultJwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is required for TOTP secret encryption');
  return s;
}

export function deriveTotpKey(secret: string = defaultJwtSecret()): Buffer {
  return createHash('sha256').update(`flowdesk-2fa:${secret}`).digest();
}

/** Encrypt plaintext TOTP secret → `iv.tag.ciphertext` (all base64). */
export function encryptTotpSecret(plaintext: string, key: Buffer = deriveTotpKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

/** Decrypt `iv.tag.ciphertext` back to TOTP secret plaintext. */
export function decryptTotpSecret(blob: string, key: Buffer = deriveTotpKey()): string {
  const [ivB64, tagB64, dataB64] = blob.split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid encrypted TOTP secret format');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return dec.toString('utf8');
}

export const MAX_BACKUP_CODES = 16;

/** Generate N random backup codes (plain) and their bcrypt hashes. */
export async function generateBackupCodes(count = 8): Promise<{
  plain: string[];
  hashes: string[];
}> {
  const safeCount = Math.min(Math.max(count, 1), MAX_BACKUP_CODES);
  const plain: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < safeCount; i++) {
    // 10 hex chars → readable one-time codes
    const code = randomBytes(5).toString('hex');
    plain.push(code);
    hashes.push(await bcrypt.hash(code, 10));
  }
  return { plain, hashes };
}

/** Consume a backup code if it matches any hash; returns remaining hashes or null if no match. */
export async function consumeBackupCode(code: string, hashes: string[]): Promise<string[] | null> {
  for (let i = 0; i < hashes.length; i++) {
    const match = await bcrypt.compare(code, hashes[i]!);
    if (match) {
      return hashes.filter((_, idx) => idx !== i);
    }
  }
  return null;
}
