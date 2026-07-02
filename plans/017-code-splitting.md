# Plan 017 — Code Splitting + Lazy Loading

**Findings:** PERF-05
**Commit:** `732acb4`
**Effort:** M | **Risk:** MED | **Files:** 4+

## Problem

No code splitting (vite.config.ts:32-36). All routes and features in a single bundle. Initial page load downloads entire app (chat, board, AI, labels, etc.) even for login/dashboard.

## Prerequisites

- Plan 011 (Vite prod config) should land first — establishes clean build baseline.

## Changes

### 1. Lazy-load route pages

**File:** `apps/web/src/App.tsx`

Wrap route components in `React.lazy`:

```typescript
import { lazy, Suspense } from 'react';

const BoardPage = lazy(() => import('./pages/board'));
const ListPage = lazy(() => import('./pages/list'));
const ChatPage = lazy(() => import('./pages/chat'));
const SettingsPage = lazy(() => import('./pages/settings'));
const DashboardPage = lazy(() => import('./pages/dashboard'));
// ... etc for each route
```

Wrap `<Routes>` in `<Suspense fallback={<Loading />}>`.

### 2. Manual chunks in Vite config

**File:** `apps/web/vite.config.ts`

```typescript
build: {
  outDir: 'dist',
  sourcemap: import.meta.env.DEV,
  target: 'es2022',
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor-react': ['react', 'react-dom', 'react-router-dom'],
        'vendor-radix': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', /* etc */],
        'vendor-query': ['@tanstack/react-query'],
        'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable'],
        'vendor-socket': ['socket.io-client'],
      },
    },
  },
},
```

Check `apps/web/package.json` for exact dependency names. Adjust chunk names based on actual imports.

### 3. Verify each page exports default

Each lazy-loaded page needs `export default` for the component. Check existing pages — most likely already export default.

## Verification

```bash
# 1. Build
pnpm --filter @flow-desk/web build

# 2. Check chunk count — should be 6+ separate JS files
find apps/web/dist/assets -name "*.js" | wc -l
# Expected: >6

# 3. Check gzip size of main chunk — should be smaller
ls -la apps/web/dist/assets/*.js | sort -k5 -n | tail -5
```

## Scope

- `apps/web/src/App.tsx` — lazy imports
- `apps/web/vite.config.ts` — manualChunks
- Individual page files — ensure default exports

## Out of Scope

- Component-level code splitting (React.memo, virtualization) — separate plan
- Image/lazy loading — separate concern
