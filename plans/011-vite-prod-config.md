# Plan 011 — Vite Production Config

**Findings:** PERF-06, PERF-07
**Commit:** `732acb4`
**Effort:** S | **Risk:** LOW | **Files:** 2

## Problem

1. **PERF-06** — `ReactQueryDevtools` included in production builds (main.tsx:27). The condition `!import.meta.env.VITE_DISABLE_DEVTOOLS` is true in prod since the env var isn't set. Adds ~30KB gzipped + exposes internal query state.
2. **PERF-07** — `sourcemap: true` unconditionally (vite.config.ts:34). Doubles build output; source code publicly visible if deployed to CDN.

## Changes

### Fix PERF-06: Use Vite's built-in DEV flag

**File:** `apps/web/src/main.tsx`

```typescript
// BEFORE (line 27)
{!import.meta.env.VITE_DISABLE_DEVTOOLS && (

// AFTER
{import.meta.env.DEV && (
```

`import.meta.env.DEV` is `true` in dev, `false` in production builds. No env var needed.

### Fix PERF-07: Sourcemaps only in dev

**File:** `apps/web/vite.config.ts`

```typescript
// BEFORE (line 34)
sourcemap: true,

// AFTER
sourcemap: import.meta.env.DEV,
```

## Verification

```bash
# 1. Build
pnpm --filter @flow-desk/web build

# 2. Check dist output — no .map files
find apps/web/dist -name "*.map" | head -5
# Expected: no output

# 3. Check bundle size — should be smaller
ls -la apps/web/dist/assets/*.js | head -5
```

## Scope

- `apps/web/src/main.tsx` — devtools condition
- `apps/web/vite.config.ts` — sourcemap
