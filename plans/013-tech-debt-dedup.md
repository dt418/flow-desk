# Plan 013 — Tech Debt Dedup

**Findings:** TECH-01, TECH-02
**Commit:** `732acb4`
**Effort:** S | **Risk:** LOW | **Files:** 6

## Problem

1. **TECH-01** — `safeEmit` function copy-pasted in 3 service files (task.service.ts:37-43, comment.service.ts:17-23, chat.message.service.ts:17-23).
2. **TECH-02** — `PRIORITY_BAR`, `PRIORITY_DOT`, `STATUS_TONE`, `shortId()`, `initials()`, `relativeDate()`, `PriorityDot` duplicated across board.tsx, list.tsx, TaskCard.tsx.

## Changes

### Fix TECH-01: Extract safeEmit

**New file:** `apps/api/src/shared/lib/socket-events.ts`

```typescript
import { getIO } from './socket';
import { logger } from './logger';

export function safeEmit(room: string, event: string, data: unknown) {
  try {
    getIO().to(room).emit(event, data);
  } catch (err) {
    logger.debug({ room, event, err }, 'safeEmit failed');
  }
}
```

Check the existing `safeEmit` implementations — they may have slightly different signatures (some take `socket` instead of `room`). If so, extract the common pattern and keep socket-specific variants as thin wrappers.

**Files to update:**

- `apps/api/src/modules/task/task.service.ts` — remove local `safeEmit`, import from shared
- `apps/api/src/modules/comment/comment.service.ts` — same
- `apps/api/src/modules/chat/chat.message.service.ts` — same

### Fix TECH-02: Extract task display helpers

**New file:** `apps/web/src/features/task/utils.ts`

Move shared constants and helpers:

- `PRIORITY_BAR` (color map)
- `PRIORITY_DOT` (color map)
- `STATUS_TONE` (color map)
- `shortId(id: string): string`
- `initials(name: string): string`
- `relativeDate(date: Date | string): string`
- `PriorityDot` component (if small and shared)

**Files to update:**

- `apps/web/src/pages/board.tsx` — import from utils, remove local definitions
- `apps/web/src/pages/list.tsx` — same
- `apps/web/src/features/task/components/TaskCard.tsx` — same

## Verification

```bash
# 1. Typecheck (API + web)
pnpm typecheck

# 2. Build
pnpm --filter @flow-desk/web build

# 3. Integration tests
pnpm --filter @flow-desk/api test:integration
```

## Scope

- `apps/api/src/shared/lib/socket-events.ts` (new)
- `apps/api/src/modules/task/task.service.ts`
- `apps/api/src/modules/comment/comment.service.ts`
- `apps/api/src/modules/chat/chat.message.service.ts`
- `apps/web/src/features/task/utils.ts` (new)
- `apps/web/src/pages/board.tsx`
- `apps/web/src/pages/list.tsx`
- `apps/web/src/features/task/components/TaskCard.tsx`

## Out of Scope

- TECH-03 (email worker files) — separate refactoring, higher risk
- TECH-04 (workspace routes) — separate refactoring
