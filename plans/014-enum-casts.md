# Plan 014 — Prisma Enum `as any` Casts

**Findings:** TECH-07
**Commit:** `732acb4`
**Effort:** S | **Risk:** LOW | **Files:** 2

## Problem

Scheduler and digest files use `as any` casts on Prisma enum values (scheduler.ts:18,37,38,114, digest.ts:34). If enum values change, TypeScript can't catch invalid values.

## Changes

**File:** `apps/api/src/workers/email/scheduler.ts`

Replace string literals with proper enum imports:

```typescript
// BEFORE
status: { not: 'DONE' as any }
type: 'DUE_REMINDER' as any,
status: { in: ['PENDING' as any, 'PROCESSING' as any] },

// AFTER
import { TaskStatus, EmailJobType, EmailJobStatus } from '@flowdesk/db';

status: { not: TaskStatus.DONE }
type: EmailJobType.DUE_REMINDER,
status: { in: [EmailJobStatus.PENDING, EmailJobStatus.PROCESSING] },
```

**File:** `apps/api/src/workers/email/processors/digest.ts`

Same pattern — import enums and use directly.

Check `packages/db/prisma/schema.prisma` for the exact enum names and values. The Prisma client auto-generates these types after `prisma generate`.

## Verification

```bash
# 1. Generate Prisma client
pnpm --filter @flowdesk/db db:generate

# 2. Typecheck
pnpm --filter @flow-desk/api exec tsc --noEmit

# 3. Integration tests
pnpm --filter @flow-desk/api test:integration
```

## Scope

- `apps/api/src/workers/email/scheduler.ts`
- `apps/api/src/workers/email/processors/digest.ts`
