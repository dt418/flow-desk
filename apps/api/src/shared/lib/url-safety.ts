import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { BadRequestError } from '../errors';
import { env } from './env';

export type LookupFn = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

const defaultLookup: LookupFn = async (hostname) => {
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map((r) => ({ address: r.address, family: r.family }));
};

function ipToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = (n << 8) | v;
  }
  return n >>> 0;
}

/**
 * Expand IPv6 to full 8 hextets (lowercase, zero-padded).
 * Returns null if the address is not pure IPv6 (no IPv4-mapped dotted tail).
 */
export function expandIPv6(address: string): string | null {
  let s = address.toLowerCase().replace(/^\[|\]$/g, '');
  const zone = s.indexOf('%');
  if (zone >= 0) s = s.slice(0, zone);
  if (s.includes('.')) return null;
  if (s.split('::').length > 2) return null;

  let head: string[];
  let tail: string[];
  if (s.includes('::')) {
    const [h, t] = s.split('::');
    head = h ? h.split(':') : [];
    tail = t ? t.split(':') : [];
    const missing = 8 - head.length - tail.length;
    if (missing < 0) return null;
    const mid = Array.from({ length: missing }, () => '0');
    head = [...head, ...mid, ...tail];
  } else {
    head = s.split(':');
    if (head.length !== 8) return null;
  }
  if (head.length !== 8 || head.some((h) => !/^[0-9a-f]{1,4}$/.test(h))) return null;
  return head.map((h) => h.padStart(4, '0')).join(':');
}

/**
 * Extract IPv4 from IPv4-mapped IPv6:
 * - dotted: `::ffff:127.0.0.1`
 * - hex:    `::ffff:7f00:1`
 */
export function extractMappedIPv4(address: string): string | null {
  const lower = address.toLowerCase().replace(/^\[|\]$/g, '');
  const dotted = lower.match(/(?:^|:)ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted?.[1]) return dotted[1];

  const hex = lower.match(/(?:^|:)ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex?.[1] && hex[2]) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    if (!Number.isFinite(hi) || !Number.isFinite(lo)) return null;
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }
  return null;
}

/** AWS IMDS IPv6 prefix `fd00:ec2::/32` — always blocked even when private URLs allowed. */
function isAwsImdsIPv6(expanded: string): boolean {
  return expanded.startsWith('fd00:0ec2:');
}

function isIPv6Loopback(expanded: string): boolean {
  return expanded === '0000:0000:0000:0000:0000:0000:0000:0001';
}

function isIPv6Unspecified(expanded: string): boolean {
  return expanded === '0000:0000:0000:0000:0000:0000:0000:0000';
}

/** True for addresses that must never be webhook targets (metadata, loopback, etc.). */
export function isBlockedAddress(address: string, allowPrivate: boolean): boolean {
  const mapped = extractMappedIPv4(address);
  if (mapped) return isBlockedAddress(mapped, allowPrivate);

  const family = isIP(address);
  if (family === 4) {
    const n = ipToInt(address);
    if (n === null) return true;
    // 0.0.0.0/8
    if (n >>> 24 === 0) return true;
    // 127.0.0.0/8 loopback
    if (n >>> 24 === 127) return true;
    // 169.254.0.0/16 link-local / cloud metadata — never allowed
    if (n >>> 16 === 0xa9fe) return true;
    // 224.0.0.0/4 multicast
    if (n >>> 28 === 0xe) return true;
    // 255.255.255.255
    if (n === 0xffffffff) return true;
    if (!allowPrivate) {
      // 10.0.0.0/8
      if (n >>> 24 === 10) return true;
      // 172.16.0.0/12
      if (n >>> 20 === 0xac1) return true;
      // 192.168.0.0/16
      if (n >>> 16 === 0xc0a8) return true;
      // 100.64.0.0/10 CGNAT
      if (n >>> 22 === 0x191) return true;
      // 198.18.0.0/15 benchmarking
      if (n >>> 17 === 0x6309) return true;
    }
    return false;
  }
  if (family === 6) {
    const expanded = expandIPv6(address);
    if (!expanded) return true;
    if (isIPv6Loopback(expanded) || isIPv6Unspecified(expanded)) return true;
    // AWS IMDS IPv6 — always blocked (metadata contract)
    if (isAwsImdsIPv6(expanded)) return true;
    // fe80::/10 link-local — always blocked
    const hextet0 = parseInt(expanded.slice(0, 4), 16);
    if ((hextet0 & 0xffc0) === 0xfe80) return true;
    // fc00::/7 unique local — blocked unless private webhooks allowed
    if (!allowPrivate && (hextet0 & 0xfe00) === 0xfc00) return true;
    return false;
  }
  return true;
}

function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (!h || h === 'localhost') return true;
  if (h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (h === 'metadata.google.internal') return true;
  return false;
}

export type ResolvedSafeUrl = {
  url: URL;
  /** DNS A/AAAA records that passed the blocklist (pinned for connect). */
  addresses: Array<{ address: string; family: number }>;
};

/**
 * Parse + resolve + filter. Returns safe addresses to pin for outbound connect.
 * Throws BadRequestError when the URL is not allowed.
 */
export async function resolveSafeOutboundUrl(
  urlString: string,
  opts?: { allowPrivate?: boolean; lookupFn?: LookupFn },
): Promise<ResolvedSafeUrl> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new BadRequestError('URL is not allowed for outbound webhooks');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestError('URL is not allowed for outbound webhooks');
  }
  if (url.username || url.password) {
    throw new BadRequestError('URL is not allowed for outbound webhooks');
  }

  const hostname = url.hostname;
  if (isBlockedHostname(hostname)) {
    throw new BadRequestError('URL is not allowed for outbound webhooks');
  }

  const allowPrivate = opts?.allowPrivate ?? env.ALLOW_PRIVATE_WEBHOOK_URLS === true;

  if (isIP(hostname)) {
    if (isBlockedAddress(hostname, allowPrivate)) {
      throw new BadRequestError('URL is not allowed for outbound webhooks');
    }
    const family = isIP(hostname) as 4 | 6;
    return { url, addresses: [{ address: hostname, family }] };
  }

  try {
    const lookupFn = opts?.lookupFn ?? defaultLookup;
    const records = await lookupFn(hostname);
    const safe = records.filter((r) => !isBlockedAddress(r.address, allowPrivate));
    if (safe.length === 0) {
      throw new BadRequestError('URL is not allowed for outbound webhooks');
    }
    return { url, addresses: safe };
  } catch (err) {
    if (err instanceof BadRequestError) throw err;
    throw new BadRequestError('URL is not allowed for outbound webhooks');
  }
}

/**
 * Returns true if the URL is safe for server-side outbound fetch.
 */
export async function isSafeOutboundUrl(
  urlString: string,
  opts?: { allowPrivate?: boolean; lookupFn?: LookupFn },
): Promise<boolean> {
  try {
    await resolveSafeOutboundUrl(urlString, opts);
    return true;
  } catch {
    return false;
  }
}

export async function assertSafeOutboundUrl(
  urlString: string,
  opts?: { allowPrivate?: boolean; lookupFn?: LookupFn },
): Promise<void> {
  await resolveSafeOutboundUrl(urlString, opts);
}

export type SafeFetchInit = RequestInit & {
  /** Override allow-private (defaults to env). */
  allowPrivate?: boolean;
  lookupFn?: LookupFn;
};

/**
 * Outbound fetch that pins DNS to addresses validated by resolveSafeOutboundUrl,
 * closing the rebinding TOCTOU window between check and connect.
 * Always uses redirect: 'manual'.
 */
export async function safeOutboundFetch(
  urlString: string,
  init: SafeFetchInit = {},
): Promise<Response> {
  const { allowPrivate, lookupFn, ...fetchInit } = init;
  const resolved = await resolveSafeOutboundUrl(urlString, { allowPrivate, lookupFn });
  const allowed = resolved.addresses;

  // Pin connect-time DNS to the pre-validated set (Node undici Agent).
  const { Agent, fetch: undiciFetch } = await import('undici');
  const agent = new Agent({
    connect: {
      lookup(
        _hostname: string,
        options: { all?: boolean },
        callback: (
          err: Error | null,
          address: string | Array<{ address: string; family: number }>,
          family?: number,
        ) => void,
      ) {
        if (options.all) {
          callback(null, allowed);
          return;
        }
        const first = allowed[0]!;
        callback(null, first.address, first.family);
      },
    },
  });

  try {
    // Cast: undici Response vs DOM lib Response diverge on FormData typings across versions.
    const res = await undiciFetch(urlString, {
      ...fetchInit,
      redirect: 'manual',
      dispatcher: agent,
    } as Parameters<typeof undiciFetch>[1]);
    return res as unknown as Response;
  } finally {
    await agent.close();
  }
}
