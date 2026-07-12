import { describe, it, expect } from 'vitest';
import {
  deriveTotpKey,
  encryptTotpSecret,
  decryptTotpSecret,
  generateBackupCodes,
  consumeBackupCode,
  MAX_BACKUP_CODES,
} from './totp';
import { generateTotpSecret, generateTotpToken, verifyTotpToken, totpKeyUri } from './totp-engine';

describe('totp crypto (P1-5)', () => {
  const key = deriveTotpKey('test-jwt-secret-at-least-32-chars!!');

  it('encrypt/decrypt roundtrips a secret', () => {
    const plain = 'JBSWY3DPEHPK3PXP';
    const blob = encryptTotpSecret(plain, key);
    expect(blob).not.toContain(plain);
    expect(blob.split('.')).toHaveLength(3);
    expect(decryptTotpSecret(blob, key)).toBe(plain);
  });

  it('different IVs produce different ciphertexts', () => {
    const plain = 'ABCDEFGHIJKLMNOP';
    const a = encryptTotpSecret(plain, key);
    const b = encryptTotpSecret(plain, key);
    expect(a).not.toBe(b);
    expect(decryptTotpSecret(a, key)).toBe(plain);
    expect(decryptTotpSecret(b, key)).toBe(plain);
  });

  it('generateBackupCodes returns plain + bcrypt hashes of equal length', async () => {
    const { plain, hashes } = await generateBackupCodes(4);
    expect(plain).toHaveLength(4);
    expect(hashes).toHaveLength(4);
    expect(plain[0]).toMatch(/^[0-9a-f]{10}$/);
    expect(hashes[0]).not.toBe(plain[0]);
  });

  it('consumeBackupCode removes the matched hash and rejects reuse', async () => {
    const { plain, hashes } = await generateBackupCodes(3);
    const remaining = await consumeBackupCode(plain[1]!, hashes);
    expect(remaining).not.toBeNull();
    expect(remaining).toHaveLength(2);
    const again = await consumeBackupCode(plain[1]!, remaining!);
    expect(again).toBeNull();
  });

  it('generateBackupCodes clamps to MAX_BACKUP_CODES', async () => {
    const { plain } = await generateBackupCodes(32);
    expect(plain).toHaveLength(MAX_BACKUP_CODES);
    expect(MAX_BACKUP_CODES).toBe(16);
  }, 15_000);

  it('consumeBackupCode does not mutate input array on no match', async () => {
    const { hashes } = await generateBackupCodes(8);
    const before = [...hashes];
    const result = await consumeBackupCode('nonexistent', hashes);
    expect(result).toBeNull();
    expect(hashes).toEqual(before);
  }, 15_000);
});

describe('totp-engine (P1-5)', () => {
  it('generates secret, token verifies against secret', () => {
    const secret = generateTotpSecret();
    expect(secret.length).toBeGreaterThanOrEqual(16);
    const token = generateTotpToken(secret);
    expect(token).toMatch(/^\d{6}$/);
    expect(verifyTotpToken(token, secret)).toBe(true);
    expect(verifyTotpToken('000000', secret)).toBe(false);
  });

  it('totpKeyUri is otpauth://totp/...', () => {
    const secret = generateTotpSecret();
    const uri = totpKeyUri('user@example.com', secret);
    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(uri).toContain('secret=');
    expect(uri).toContain('FlowDesk');
  });
});
