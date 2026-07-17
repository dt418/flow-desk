# Plan 033: Cap/stream task export; batch email scheduler; test rate-limit middleware

> **Executor instructions**: Follow step by step. Verify each step. STOP → report. Update `plans/README.md` when done.
>
> **Drift check**:
> `git diff --stat 081cbc6..HEAD -- apps/api/src/modules/task/task.service.ts apps/api/src/modules/task/task.routes.ts apps/api/src/workers/email/scheduler.ts apps/api/src/shared/middleware/rate-limit.ts`
> Mismatch → STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (export contract)
- **Depends on**: none (optional after 031 if touching task list types)
- **Category**: perf
- **Planned at**: commit `081cbc6`, 2026-07-15

## Why this matters

`exportTasks` loads every matching task with relations into memory before “streaming” CSV/Excel/PDF — large workspaces risk OOM. The email scheduler issues 2–3 queries per due task and per digest member every 60s. Rate-limit middleware is skipped whenever `NODE_ENV=test` or `SKIP_RATE_LIMIT=1`, so CI never proves 429 behavior.

## Current state

### Export

`task.service.ts` ~143–153:

```ts
async exportTasks(query: ExportTasksQuery, userId: string) {
  await assertMembership(query.workspaceId, userId);
  const where = buildTaskWhere(query);
  return prisma.task.findMany({
    where,
    include: { assignee: …, assignments: … },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
  });
}
```

`task.routes.ts` loads full array then builds CSV/excel/pdf.

### Scheduler

`apps/api/src/workers/email/scheduler.ts` ~32–50 and ~93–117: per-row `emailJob.findFirst` + `user.findUnique`.

### Rate limit

`rate-limit.ts` ~46–48:

```ts
if (env.NODE_ENV === 'test' || (env.SKIP_RATE_LIMIT && env.NODE_ENV !== 'production')) {
  return next();
}
```

Vitest sets `SKIP_RATE_LIMIT=1`.

## Commands you will need

| Purpose      | Command                                                        | Expected |
| ------------ | -------------------------------------------------------------- | -------- |
| Typecheck    | `pnpm --filter @flow-desk/api typecheck`                       | exit 0   |
| Unit         | `pnpm --filter @flow-desk/api test:unit`                       | pass     |
| Integration  | `pnpm --filter @flow-desk/api test:integration`                | pass     |
| Export tests | `pnpm --filter @flow-desk/api test:integration -- task-export` | pass     |
| Full         | `pnpm verify`                                                  | exit 0   |

## Scope

**In scope**:

- `apps/api/src/modules/task/task.service.ts` — export batching/cap
- `apps/api/src/modules/task/task.routes.ts` — stream CSV from batches; excel/pdf cap behavior
- `apps/api/src/modules/task/task-csv.ts` if needed
- `apps/api/src/workers/email/scheduler.ts`
- `apps/api/src/shared/middleware/rate-limit.ts` — export testable core or inject redis
- New unit tests: `rate-limit.test.ts`, scheduler query batching if extractable
- Export integration tests update
- Optional constant `MAX_EXPORT_ROWS` (e.g. 10_000) documented in error message

**Out of scope**:

- Async export job queue UI
- Changing email templates
- Removing SKIP_RATE_LIMIT from default integration suite globally

## Git workflow

- Commit example: `perf(api): batch export + email scheduler; test rate limits`
- Do not push unless asked.

## Steps

### Step 1: Export hard cap + cursor batching for CSV

1. Define `MAX_EXPORT_ROWS = 10_000` (or 5_000) in task service or constants file.
2. Refactor export to either:
   - **CSV path (required)**: iterate `findMany` with `take: 500` + cursor on `(position, id)` until exhausted or cap hit; write CSV rows incrementally into the existing `ReadableStream` in routes (do not hold all rows).
   - **Excel/PDF path**: either same batching into temp structure with cap, or reject with 413 if count > cap after `count()` probe.

3. If cap exceeded: return **413** or **400** with `{ code: 'EXPORT_TOO_LARGE', message: '…' }` — pick one and test it. Prefer counting first for excel/pdf; for CSV stop after MAX rows and either truncate with warning header row or 413 — **prefer 413 if total count known, else truncate with final comment row** `…truncated`.

Minimum acceptable MVP:

- `findMany` with `take: MAX_EXPORT_ROWS + 1`; if length > MAX, throw BadRequestError EXPORT_TOO_LARGE; else proceed as today for excel/pdf.
- CSV: still stream from the capped array (memory bounded by MAX).

Better: true cursor loop for CSV only.

**Verify**: integration test with mocked/seeded data asserts cap error OR successful small export still works (`task-export.test.ts`).

### Step 2: Batch email scheduler queries

In `scheduler.ts` due-reminder path:

1. Load due tasks with `include: { assignee: true }` (or select assignee fields) in one query.
2. Build set of assignee user ids; batch `user.findMany({ where: { id: { in: […] }}})` if assignee not included.
3. Replace per-task `emailJob.findFirst` JSON probes with:
   - either deterministic BullMQ/jobId already used on enqueue (if so, skip DB dedup), or
   - one query: recent PENDING/SENT jobs for those userIds + type in a time window, then filter in memory.

Digest path: load members with `include: { user: true }`; one query for recent digest jobs for those user ids.

Keep behavior: do not double-send reminders for same task/day.

**Verify**: unit test scheduler helper with mock prisma if extracted; else manual reasoning + existing email tests still pass.

```bash
pnpm --filter @flow-desk/api test:unit
pnpm --filter @flow-desk/api test:integration -- notification-email
```

### Step 3: Rate-limit unit tests without skipping

Options (pick simplest that works):

**A.** Export pure function `checkRateLimit({ redis, scope, identity, windowSec, max, now })` used by middleware; unit-test the function with ioredis-mock or in-memory fake implementing `eval` + `pttl`.

**B.** Temporarily call middleware with `opts` and a mock redis; force skip bypass off by testing the extracted function rather than env.

Do **not** remove `SKIP_RATE_LIMIT` for the whole integration suite.

Tests must assert:

1. Under max → next() called; headers `X-RateLimit-Limit`, `X-RateLimit-Remaining` set.
2. Over max → `RateLimitError` or 429 path (match how error handler maps it).
3. `Retry-After` / remaining semantics if already implemented below line 60.

Read rest of `rate-limit.ts` for header names.

**Verify**:

```bash
pnpm --filter @flow-desk/api test:unit -- rate-limit
```

## Test plan

| Area       | Tests                                                           |
| ---------- | --------------------------------------------------------------- |
| Export     | Existing export still 200 for small workspace; cap path covered |
| Scheduler  | No regression on notification-email-flow                        |
| Rate limit | New unit file with fake redis                                   |

## Done criteria

- [ ] Export cannot load unbounded rows (cap and/or batch)
- [ ] CSV path does not require full excel-sized graph unbounded
- [ ] Scheduler no longer does findFirst-per-task for reminders (batch or join)
- [ ] Rate-limit unit tests prove 429/headers without global SKIP off
- [ ] typecheck + unit + integration green
- [ ] `plans/README.md` 033 → DONE

## STOP conditions

- Excel library requires full matrix in memory and cap alone is the only safe fix → implement cap for all formats; skip true streaming excel.
- Scheduler file structure differs completely → re-read and batch within new structure.
- Redis mock impossible in unit env → extract pure counter logic without redis (in-memory Map) for unit, keep redis eval in middleware wrapper.

## Maintenance notes

- Reviewers: check MAX_EXPORT_ROWS is documented for operators.
- Follow-up: async export job for >10k rows.
- Rate-limit tests must not enable real Redis dependency flakiness in CI.
