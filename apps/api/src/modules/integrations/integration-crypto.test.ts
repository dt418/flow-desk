import { describe, it, expect } from 'vitest';
import { decryptToken, deriveIntegrationKey, encryptToken } from './integration-crypto';

describe('integration-crypto (P4-3)', () => {
  it('round-trips a token through encrypt/decrypt', () => {
    const plain = 'FAKE_SLACK_TOKEN_1234567890';
    const cipher = encryptToken(plain);
    expect(cipher).not.toContain(plain);
    const decoded = decryptToken(cipher);
    expect(decoded).toBe(plain);
  });

  it('produces a different ciphertext each call (random IV)', () => {
    const plain = 'token-abc';
    const a = encryptToken(plain);
    const b = encryptToken(plain);
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe(plain);
    expect(decryptToken(b)).toBe(plain);
  });

  it('rejects malformed ciphertext', () => {
    expect(() => decryptToken('not-valid')).toThrow();
    expect(() => decryptToken('only.two')).toThrow();
    expect(() => decryptToken('a.b.c.d')).toThrow();
  });

  it('uses a 32-byte key derived from JWT_SECRET', () => {
    const k = deriveIntegrationKey('test-secret');
    expect(k).toHaveLength(32);
  });

  it('two keys for different JWT secrets differ', () => {
    expect(deriveIntegrationKey('a').equals(deriveIntegrationKey('b'))).toBe(false);
  });

  it('tampered ciphertext fails GCM auth', () => {
    const cipher = encryptToken('secret');
    // flip a bit in the third base64 segment
    const [iv, tag, data] = cipher.split('.');
    const tampered = `${iv}.${tag}.${data!.slice(0, -1)}${data!.slice(-1) === 'A' ? 'B' : 'A'}`;
    expect(() => decryptToken(tampered)).toThrow();
  });
});
