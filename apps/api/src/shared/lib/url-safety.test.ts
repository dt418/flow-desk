import { describe, it, expect } from 'vitest';
import {
  isBlockedAddress,
  isSafeOutboundUrl,
  assertSafeOutboundUrl,
  extractMappedIPv4,
  expandIPv6,
  resolveSafeOutboundUrl,
} from './url-safety';
import { BadRequestError } from '../errors';

describe('expandIPv6', () => {
  it('expands compressed and full forms', () => {
    expect(expandIPv6('::1')).toBe('0000:0000:0000:0000:0000:0000:0000:0001');
    expect(expandIPv6('0:0:0:0:0:0:0:1')).toBe('0000:0000:0000:0000:0000:0000:0000:0001');
    expect(expandIPv6('fd00:ec2::254')).toBe('fd00:0ec2:0000:0000:0000:0000:0000:0254');
  });
});

describe('extractMappedIPv4', () => {
  it('parses dotted and hex IPv4-mapped IPv6', () => {
    expect(extractMappedIPv4('::ffff:127.0.0.1')).toBe('127.0.0.1');
    expect(extractMappedIPv4('::ffff:169.254.169.254')).toBe('169.254.169.254');
    expect(extractMappedIPv4('::ffff:7f00:1')).toBe('127.0.0.1');
    expect(extractMappedIPv4('::ffff:a9fe:a9fe')).toBe('169.254.169.254');
    expect(extractMappedIPv4('2001:db8::1')).toBeNull();
  });
});

describe('isBlockedAddress', () => {
  it('blocks loopback and metadata even when private allowed', () => {
    expect(isBlockedAddress('127.0.0.1', true)).toBe(true);
    expect(isBlockedAddress('169.254.169.254', true)).toBe(true);
    expect(isBlockedAddress('::1', true)).toBe(true);
    expect(isBlockedAddress('0:0:0:0:0:0:0:1', true)).toBe(true);
  });

  it('blocks IPv4-mapped loopback and metadata (dotted + hex)', () => {
    expect(isBlockedAddress('::ffff:127.0.0.1', true)).toBe(true);
    expect(isBlockedAddress('::ffff:7f00:1', true)).toBe(true);
    expect(isBlockedAddress('::ffff:a9fe:a9fe', false)).toBe(true);
  });

  it('always blocks AWS IMDS IPv6 even when private allowed', () => {
    expect(isBlockedAddress('fd00:ec2::254', true)).toBe(true);
    expect(isBlockedAddress('fd00:ec2::254', false)).toBe(true);
  });

  it('blocks RFC1918 and CGNAT only when private not allowed', () => {
    expect(isBlockedAddress('10.0.0.1', false)).toBe(true);
    expect(isBlockedAddress('192.168.1.1', false)).toBe(true);
    expect(isBlockedAddress('100.64.0.1', false)).toBe(true);
    expect(isBlockedAddress('10.0.0.1', true)).toBe(false);
    expect(isBlockedAddress('100.64.0.1', true)).toBe(false);
  });

  it('allows public IPv4', () => {
    expect(isBlockedAddress('8.8.8.8', false)).toBe(false);
    expect(isBlockedAddress('1.1.1.1', false)).toBe(false);
  });
});

describe('isSafeOutboundUrl', () => {
  it('accepts https public host with public DNS', async () => {
    const ok = await isSafeOutboundUrl('https://hooks.example.com/x', {
      allowPrivate: false,
      lookupFn: async () => [{ address: '93.184.216.34', family: 4 }],
    });
    expect(ok).toBe(true);
  });

  it('rejects loopback literal', async () => {
    expect(await isSafeOutboundUrl('http://127.0.0.1/hook')).toBe(false);
  });

  it('rejects metadata IP even with allowPrivate', async () => {
    expect(await isSafeOutboundUrl('http://169.254.169.254/latest', { allowPrivate: true })).toBe(
      false,
    );
  });

  it('rejects private DNS when allowPrivate false', async () => {
    expect(
      await isSafeOutboundUrl('https://internal.corp/hook', {
        allowPrivate: false,
        lookupFn: async () => [{ address: '10.1.2.3', family: 4 }],
      }),
    ).toBe(false);
  });

  it('rejects file: and non-http schemes', async () => {
    expect(await isSafeOutboundUrl('file:///etc/passwd')).toBe(false);
    expect(await isSafeOutboundUrl('ftp://example.com/x')).toBe(false);
  });

  it('rejects localhost hostname', async () => {
    expect(await isSafeOutboundUrl('http://localhost:3000/hook')).toBe(false);
  });

  it('assertSafeOutboundUrl throws BadRequestError', async () => {
    await expect(assertSafeOutboundUrl('http://127.0.0.1/x')).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  it('resolveSafeOutboundUrl returns pinned addresses', async () => {
    const r = await resolveSafeOutboundUrl('https://hooks.example.com/x', {
      lookupFn: async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.1', family: 4 },
      ],
    });
    expect(r.addresses).toEqual([{ address: '93.184.216.34', family: 4 }]);
  });
});
