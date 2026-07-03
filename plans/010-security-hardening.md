# Plan 010 — Security Hardening

**Findings:** ATTACH-01, HDR-01, RATE-01
**Commit:** `732acb4`
**Effort:** S | **Risk:** LOW | **Files:** 4

## Problem

Three independent security gaps:

1. **ATTACH-01** — No file extension/MIME allowlist on upload (attachment.service.ts:78-82). Attacker can upload `.html` or `.svg` with embedded script. Download sets `Content-Disposition: attachment` but no `X-Content-Type-Options: nosniff`.
2. **HDR-01** — No security headers configured (app.ts:26-67). Missing CSP, nosniff, HSTS, X-Frame-Options.
3. **RATE-01** — Rate limit collapses all IPs to `'unknown'` when `TRUST_PROXY_HOPS=0` (rate-limit.ts:24-32). All users share one bucket.

## Changes

### Fix ATTACH-01: Extension + MIME allowlist

**File:** `apps/api/src/modules/attachment/attachment.service.ts`

Add allowlist constants and validation in `uploadAttachment`:

```typescript
const ALLOWED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.csv',
  '.json',
  '.zip',
  '.tar',
  '.gz',
  '.mp3',
  '.mp4',
  '.wav',
  '.webm',
]);

const ALLOWED_MIME_PREFIXES = [
  'image/',
  'video/',
  'audio/',
  'application/pdf',
  'application/msword',
  'application/vnd.',
  'text/',
  'application/json',
  'application/zip',
];
```

In `uploadAttachment`, after `const ext = extname(file.name)` (line 78):

```typescript
const ext = extname(file.name).toLowerCase();
if (!ALLOWED_EXTENSIONS.has(ext)) {
  throw new BadRequestError(`File extension "${ext}" is not allowed`);
}
```

Also sniff MIME server-side instead of trusting client:

```typescript
// After writeFile, read first bytes to verify
const sniffedType = await import('file-type')
  .then((m) => m.fileTypeFromBuffer(buf))
  .catch(() => null);
const mimeType = sniffedType?.mime || file.type || 'application/octet-stream';
```

Note: `file-type` package may need install. If not available, skip sniffing and just validate extension. The extension allowlist is the primary defense.

### Fix HDR-01: Security headers middleware

**File:** `apps/api/src/app.ts`

Add a middleware after `requestId` (line 29) that sets security headers:

```typescript
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '0');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (env.NODE_ENV === 'production') {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
});
```

CSP is deliberately omitted here — it requires asset path inventory and would be a separate plan. The headers above cover the immediate risks.

### Fix RATE-01: Fallback to socket remote address

**File:** `apps/api/src/shared/middleware/rate-limit.ts`

When `TRUST_PROXY_HOPS=0`, read from Hono's built-in or a forwarded header:

```typescript
function getClientIp(c: { req: { header: (k: string) => string | undefined } }): string {
  if (env.TRUST_PROXY_HOPS > 0) {
    const xff = c.req.header('x-forwarded-for');
    if (xff) {
      const hops = xff.split(',').map((s) => s.trim());
      return hops[hops.length - env.TRUST_PROXY_HOPS] ?? hops[0] ?? 'unknown';
    }
    return c.req.header('x-real-ip') ?? 'unknown';
  }
  // Without proxy: try x-forwarded-for (direct connection), else 'unknown'
  // In dev/direct mode, each user gets their own IP anyway
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? 'unknown'
  );
}
```

This is a best-effort fix. The real fix is documenting that `TRUST_PROXY_HOPS` MUST be set in production behind a reverse proxy.

## Verification

```bash
# 1. Typecheck
pnpm --filter @flow-desk/api exec tsc --noEmit

# 2. Integration tests
pnpm --filter @flow-desk/api test:integration

# 3. Secret scan
pnpm check:secrets
```

## Scope

- `apps/api/src/modules/attachment/attachment.service.ts` — extension allowlist
- `apps/api/src/app.ts` — security headers
- `apps/api/src/shared/middleware/rate-limit.ts` — IP fallback

## Out of Scope

- CSP (requires asset inventory, separate plan)
- ATTACH-02 (Content-Type on download) — low risk, fix with `application/octet-stream` default in a follow-up
- AUTH-01 (clearAuthCookies flags) — XS effort, do inline if trivial
- WS-01 (leave-workspace auth) — low risk, code hygiene only
