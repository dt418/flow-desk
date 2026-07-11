import { describe, it, expect } from 'vitest';
import { generateApiKey, hashApiKey } from './api-key-crypto';

describe('api-key hashing (P4-4)', () => {
  it('generates fdkey_ raw key and stable hash', () => {
    const { raw, hashed, prefix } = generateApiKey();
    expect(raw.startsWith('fdkey_')).toBe(true);
    expect(hashed).toBe(hashApiKey(raw));
    expect(prefix).toBe(raw.slice(0, 12));
    expect(hashApiKey(raw)).not.toBe(raw);
  });

  it('different keys hash differently', () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.hashed).not.toBe(b.hashed);
  });
});
