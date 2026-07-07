import { describe, it, expect } from 'vitest';
import { parseCookieToken } from './cookie';

// ponytail: 5-line regex. Test every common shape once; not a Cookie RFC.
describe('parseCookieToken', () => {
  it('extracts a single cookie', () => {
    expect(parseCookieToken('access_token=abc.def.ghi', 'access_token')).toBe('abc.def.ghi');
  });

  it('handles multiple cookies and surrounding whitespace', () => {
    expect(parseCookieToken('foo=1; access_token=abc; bar=2', 'access_token')).toBe('abc');
  });

  it('url-decodes the value', () => {
    expect(parseCookieToken('access_token=hello%20world', 'access_token')).toBe('hello world');
  });

  it('returns null when the cookie is missing', () => {
    expect(parseCookieToken('foo=1; bar=2', 'access_token')).toBeNull();
  });

  it('returns null when no header', () => {
    expect(parseCookieToken(undefined, 'access_token')).toBeNull();
  });

  it('handles values containing = (base64url JWTs have no =, but be safe)', () => {
    expect(parseCookieToken('access_token=a=b=c', 'access_token')).toBe('a=b=c');
  });
});
