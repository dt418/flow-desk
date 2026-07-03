# Plan 009 — Email Worker Bugs

**Findings:** CORRECT-01, CORRECT-02, CORRECT-03
**Commit:** `732acb4`
**Effort:** S | **Risk:** LOW | **Files:** 3

## Problem

Three independent bugs in the email notification system:

1. **CORRECT-01** — Due reminder dedup queries by `userId` only (scheduler.ts:34-41). If a user has 3 tasks due in 24h, only the first gets a reminder. The other 2 are silently suppressed.
2. **CORRECT-02** — `cancelDelayed` (schedule-delayed.ts:41-45) sets DB status to CANCELLED but doesn't remove the BullMQ job. The worker processes it anyway, overwriting status to SENT.
3. **CORRECT-03** — Instant emailJob created with `status: 'SENT'` (notification-email.service.ts:52) before the worker actually sends the email. If the worker fails, DB shows sent but email wasn't delivered.

## Changes

### Fix CORRECT-01: Due reminder dedup per-task

**File:** `apps/api/src/workers/email/scheduler.ts`

Line 34-41 — change the `findFirst` query to scope by `taskId`:

```typescript
// BEFORE: queries by userId only
const existing = await prisma.emailJob.findFirst({
  where: {
    userId: task.assigneeId,
    type: 'DUE_REMINDER' as any,
    status: { in: ['PENDING' as any, 'PROCESSING' as any] },
    createdAt: { gte: new Date(now.getTime() - 24 * 3600_000) },
  },
});

// AFTER: query by taskId in metadata
const existing = await prisma.emailJob.findFirst({
  where: {
    userId: task.assigneeId,
    type: 'DUE_REMINDER' as any,
    status: { in: ['PENDING' as any, 'PROCESSING' as any] },
    createdAt: { gte: new Date(now.getTime() - 24 * 3600_000) },
    metadata: { path: ['taskId'], equals: task.id },
  },
});
```

The `enqueueEmail` call on line 57 already passes `metadata: { taskId: task.id }`, so the query side just needs to filter on it. Prisma JSON filter syntax: `{ path: ['taskId'], equals: task.id }`.

### Fix CORRECT-02: Cancel BullMQ job on cancelDelayed

**File:** `apps/api/src/workers/email/schedule-delayed.ts`

Import the queue and remove the job:

```typescript
import { emailQueue } from './queue'; // add import at top

export async function cancelDelayed(userId: string, jobId: string) {
  // Remove from BullMQ first
  const job = await emailQueue.getJob(jobId);
  if (job) {
    await job.remove();
  }

  // Then update DB status
  await prisma.emailJob.updateMany({
    where: { id: jobId, userId, type: 'DELAYED', status: 'PENDING' },
    data: { status: 'CANCELLED' },
  });
}
```

Check `apps/api/src/workers/email/queue.ts` for the correct export name of the queue instance (likely `emailQueue` or similar). Adjust import accordingly.

### Fix CORRECT-03: Instant emails start as PENDING

**File:** `apps/api/src/modules/notification/notification-email.service.ts`

Line 52 — change `status: delayMs ? 'PENDING' : 'SENT'` to always `PENDING`:

```typescript
// BEFORE
status: delayMs ? 'PENDING' : 'SENT',

// AFTER
status: 'PENDING',
```

The send worker already handles INSTANT type and updates status to SENT after successful delivery. This makes the DB state accurate.

## Verification

```bash
# 1. Typecheck
pnpm --filter @flow-desk/api exec tsc --noEmit

# 2. Integration tests
pnpm --filter @flow-desk/api test:integration

# 3. Secret scan
pnpm check:secrets
```

Expected: typecheck passes, existing tests pass, no secrets.

## Scope

- `apps/api/src/workers/email/scheduler.ts` — query fix
- `apps/api/src/workers/email/schedule-delayed.ts` — cancel fix
- `apps/api/src/modules/notification/notification-email.service.ts` — status fix

## Out of Scope

- CORRECT-04 (zombie emailJob) and CORRECT-05 (tick overlap) — lower priority, separate plan if needed.
- Worker-level idempotency guards — deferred.
