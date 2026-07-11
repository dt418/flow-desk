# Plan 024: N+1 queries and hot-path perf

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 870c8ed..HEAD -- apps/api/src/modules/chat apps/api/src/modules/sprint apps/api/src/modules/board apps/api/src/modules/task apps/api/src/modules/ai apps/api/src/modules/activity packages/db/prisma`
> If any in-scope file changed, compare "Current state" excerpts against
> the live code before proceeding; on a mismatch, treat it as a STOP
> condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW–MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `870c8ed`, 2026-07-11

## Why this matters

Eight hot-path inefficiencies compound across the app's most-touched
endpoints. Per task create, the activity → webhook fan-out does N
serialized Redis adds instead of one. Per chat channel list render, the
"latest message" subquery runs N times (N = channel count). The sprint
list page does N+1 aggregates. The board `GET` silently truncates past 50
tasks per column with no UI signal. Two stale-fetch races (BoardSwitcher

- chat notification re-read) waste round-trips on every send. The LLM
  "suggest assignee" button re-asks the provider for identical inputs. The
  Task list has a missing composite index that forces seq-scan on large
  workspaces. None are crash bugs; all are silent costs that compound as
  usage grows.

## Current state

### PERF-02 — Chat channel list N+1

`apps/api/src/modules/chat/chat.repository.ts:24-42`:

```ts
include: { messages: { take: 1, orderBy: { createdAt: 'desc' } } }
```

N channel rows = N subqueries. `ChatMessage` has
`@@index([channelId, createdAt])` (`packages/db/prisma/schema.prisma:311`),
ASC-ordered but usable for DESC via PG backward scan.

### PERF-03 — Sprint list N+1 aggregate

`apps/api/src/modules/sprint/sprint.service.ts:28-46`:

```ts
const rows = await prisma.sprint.findMany(...);
const enriched = await Promise.all(rows.map((s) =>
  prisma.task.aggregate({ where: { sprintId: s.id, deletedAt: null }, ... }),
));
```

### PERF-04 — Board `take:50` truncation

`apps/api/src/modules/board/board.routes.ts:39-58` — each column's
`include.tasks.take: 50` is a hard cap with no `taskCount` field on the
response. 2000-task workspaces silently lose 1950 per column.

### PERF-05 — BoardSwitcher first-render race

`apps/web/src/features/board/components/BoardSwitcher.tsx:24-28`:

```ts
useEffect(() => {
  if (!value && items.length > 0) {
    onChange(items[0]!.id);
  }
}, [value, items, onChange]);
```

Between mount and effect, `board.tsx:50` already fired `GET /board`
without `boardId` — full board fetched once, then a second time after
`value` settles.

### PERF-06 — Missing Task composite index

`apps/api/src/modules/task/task.service.ts:109-118` — `orderBy: [{ position:
'asc' }, { id: 'asc' }]` with `where: { workspaceId, deletedAt: null }` and
no `columnId` filter. Existing `@@index([columnId])`,
`@@index([workspaceId, deletedAt])` — neither composite covers this path.

### PERF-07 — LLM suggestAssignee no cache

`apps/api/src/modules/ai/ai.service.ts:38-72` — re-fetches members +
workload per call, then `llm.chatJSON(...)`. No Redis cache.

### PERF-08 — Webhook fan-out uses `add`, not `addBulk`

`apps/api/src/modules/activity/activity.service.ts:23-43` — iterates
`webhooks` and calls `webhookQueue.add(...)` per webhook. BullMQ
`addBulk` is one round-trip.

### PERF-09 — Chat sendMessage re-reads notifications

`apps/api/src/modules/chat/chat.message.service.ts:121-127` — after the
insert transaction commits, calls
`repo.findNotificationsForMessage(prisma, message.id)` to re-read rows
already known in scope.

### Repo conventions

- Soft-delete queries: `where: { deletedAt: null }` explicit on
  `findFirst`; `findUnique` returns null via the extension. See
  `apps/api/src/modules/sprint/sprint.service.ts:34-46` for the pattern.
- Redis cache key: `auth:user:{id}` style (see
  `apps/api/src/shared/lib/auth-cache.ts:18` for the precedent).
- Prisma transaction: `prisma.$transaction(async (tx) => { ... })` with
  returns captured in the callback scope (see
  `apps/api/src/modules/task/task.service.ts:180-260` for an exemplar).
- Add migration: `packages/db/prisma/migrations/<timestamp>_<slug>/migration.sql`;
  add model field/index in `schema.prisma`; regenerate with
  `pnpm --filter @flowdesk/db db:generate`.

## Commands you will need

| Purpose   | Command                                                                        | Expected on success |
| --------- | ------------------------------------------------------------------------------ | ------------------- |
| Typecheck | `pnpm --filter @flow-desk/api typecheck`                                       | exit 0              |
| Unit      | `pnpm --filter @flow-desk/api exec vitest run --config vitest.config.ts`       | all pass            |
| Integ     | `TEST_DB_PORT=5433 pnpm exec vitest run --config vitest.integration.config.ts` | all pass            |
| Build     | `pnpm build`                                                                   | exit 0              |
| Prisma    | `pnpm --filter @flowdesk/db db:generate`                                       | exit 0              |

## Scope

**In scope**:

- `apps/api/src/modules/chat/chat.repository.ts` (PERF-02)
- `apps/api/src/modules/chat/chat.message.service.ts` (PERF-09)
- `apps/api/src/modules/sprint/sprint.service.ts` (PERF-03)
- `apps/api/src/modules/board/board.routes.ts` (PERF-04)
- `apps/web/src/features/board/components/BoardSwitcher.tsx` (PERF-05)
- `apps/web/src/pages/board.tsx` (PERF-05 follow-on: gate query on `boardId`)
- `apps/api/src/modules/task/task.service.ts` (PERF-06 — index impact)
- `apps/api/src/modules/ai/ai.service.ts` (PERF-07)
- `apps/api/src/modules/activity/activity.service.ts` (PERF-08)
- `packages/db/prisma/schema.prisma` (PERF-06 index additions)
- `packages/db/prisma/migrations/<new>/migration.sql` (PERF-06)
- `apps/api/tests/integration/<existing>` (regressions)

**Out of scope**:

- Web perf-10/11/12 (bundle split, dnd-kit leak, comment \_count subqueries) — separate audit tier, lower confidence.
- Public API write surface — handled in plan 026.
- Anything outside the 8 findings above.

## Git workflow

- Branch: `advisor/024-hot-path-perf`
- One commit per step.
- Conventional commits: `perf(chat): N+1 channel list`, `feat(db): index for task list position sort`, etc.

## Steps

### Step 1 — PERF-08: webhook fan-out uses `addBulk`

In `apps/api/src/modules/activity/activity.service.ts`, find the section
that calls `webhookQueue.add(...)` per webhook. Replace with
`webhookQueue.addBulk(jobs)` where `jobs` is the array of BullMQ job
options built in the existing loop.

The exact shape:

- The current code reads `webhooks` from `prisma.webhook.findMany({ where:
{ workspaceId, isActive: true, deletedAt: null, events: { has: action } } })`.
- Build `const jobs = webhooks.map(w => ({ name: 'webhook', data: { ... } }))`.
- Replace the loop with `if (jobs.length > 0) await webhookQueue.addBulk(jobs);`.

**Verify**: `grep -n "webhookQueue.add\b" apps/api/src/modules/activity/activity.service.ts` → 0 matches. `grep -n "addBulk" apps/api/src/modules/activity/activity.service.ts` → ≥ 1.

### Step 2 — PERF-02: chat channel list with `DISTINCT ON` for latest message

Replace the N×subquery in `apps/api/src/modules/chat/chat.repository.ts:24-42`
with a single query using Postgres `DISTINCT ON`:

```ts
// pseudo-SQL Prisma can't express DISTINCT ON; use $queryRaw
const latestByChannel = await prisma.$queryRaw<
  Array<{ channelId: string; id: string; content: string; createdAt: Date }>
>`
  SELECT DISTINCT ON ("channelId") "channelId", "id", "content", "createdAt"
  FROM "ChatMessage"
  WHERE "channelId" = ANY(${channelIds})
    AND "deletedAt" IS NULL
  ORDER BY "channelId", "createdAt" DESC
`;
```

Then merge into the channel rows in JS. Keep the existing `findByWorkspace`
signature so callers don't change.

**Verify**: `pnpm --filter @flow-desk/api typecheck` → exit 0. Existing chat integration tests still pass.

### Step 3 — PERF-03: sprint list `groupBy` instead of N aggregates

In `apps/api/src/modules/sprint/sprint.service.ts:28-46`, replace the
`Promise.all(rows.map(s => aggregate))` with a single
`prisma.task.groupBy({ by: ['sprintId'], where: { sprintId: { in: ids },
deletedAt: null }, _sum: { estimate: true }, _count: true })` then
`Map<id, groupByResult>` and merge in JS.

**Verify**: existing sprint integration test (`tests/integration/sprint.test.ts`) passes; `grep -n "Promise.all(rows.map" apps/api/src/modules/sprint/sprint.service.ts` → 0 matches.

### Step 4 — PERF-04: board endpoint reports `taskCount` per column + surface truncation

In `apps/api/src/modules/board/board.routes.ts:39-58`, keep the
`take: 50` cap but compute the true count alongside. The Prisma include
supports `_count` on relations — replace `include: { tasks: { where:
..., take: 50, ... } }` with a parallel `prisma.task.count({ where: {
columnId: { in: columnIds }, deletedAt: null, ...taskWhere } })` once,
then merge `count` per column into the response shape.

Add `taskCount` to each column in the response so the FE can render
"50 of 200" when truncated.

If the FE doesn't yet render the count, leave the field added but
unread — the plan lands the data; a follow-up wires the UI.

**Verify**: `pnpm --filter @flow-desk/api typecheck` → exit 0. `curl` test (if dev server running) — response shape includes `taskCount` per column.

### Step 5 — PERF-05: gate board query on `boardId` and stop defaulting to all-boards

In `apps/web/src/pages/board.tsx`, change the React Query from
`enabled: Boolean(workspaceId)` to
`enabled: Boolean(workspaceId) && boardId !== null`. The defaulting in
`BoardSwitcher` should still set the first board, but the page must
wait for it. Also, wrap `onChange` in a `useCallback` so the
`BoardSwitcher`'s `useEffect` doesn't re-fire on parent re-render.

**Verify**: `pnpm --filter @flow-desk/web typecheck` → exit 0. `pnpm --filter @flow-desk/web build` → exit 0.

### Step 6 — PERF-06: add composite index `(workspaceId, deletedAt, position)` to Task

`packages/db/prisma/schema.prisma` in the `Task` model — add

```prisma
@@index([workspaceId, deletedAt, position])
@@index([columnId, position])
```

Create the migration:

```bash
mkdir -p packages/db/prisma/migrations/20260711170000_task_position_index
```

And write `migration.sql`:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Task_workspaceId_deletedAt_position_idx"
  ON "Task"("workspaceId", "deletedAt", "position");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Task_columnId_position_idx"
  ON "Task"("columnId", "position");
```

(Note: `CONCURRENTLY` is required for production-scale tables. The local
test DB is small so the migration runs instantly either way.)

Then `pnpm --filter @flowdesk/db db:generate`.

**Verify**: `pnpm typecheck` → exit 0. `grep -n "position" packages/db/prisma/schema.prisma | grep @@index` → 2 matches.

### Step 7 — PERF-07: cache `suggestAssignee` in Redis with 5 min TTL

In `apps/api/src/modules/ai/ai.service.ts:38-72`, wrap the LLM call in a
Redis cache lookup. Cache key:
`ai:suggest-assignee:{workspaceId}:{sha1(title + sorted memberIds)}`. TTL
300 seconds. On hit, return the cached suggestions without calling
`llm.chatJSON`.

Add cache invalidation hook in `apps/api/src/modules/workspace/workspace.service.ts`
(or wherever `WorkspaceMember` create/delete lives) — bust the prefix
on member-set change. Look at `apps/api/src/shared/lib/auth-cache.ts:50-60`
for the existing `redis.del` pattern.

**Verify**: existing `tests/integration/ai.service.test.ts` (8 tests) all pass. Add 1 new test: "second call with same inputs hits cache (does not call provider)" using the same `vi.spyOn` approach the test file already uses.

### Step 8 — PERF-09: chat sendMessage returns notifications from the tx

In `apps/api/src/modules/chat/chat.message.service.ts:121-127`, change
the `repo.findNotificationsForMessage(prisma, message.id)` post-tx call
to read the notifications from the tx callback's return value. The
pattern: in the `$transaction(async (tx) => { ... })` block, capture
`const created = await tx.notification.createMany({ ..., returning: … })`
(if Prisma version supports it) or split into per-user `tx.notification.create`
calls and collect the rows in a local array, then return `{ message,
notifications }` from the callback. Outside the tx, use the collected
array for the `emitToUser` loop.

If `createMany` doesn't support `returning` in your Prisma 7 version,
the per-row create path is fine — it's O(mentions) where mentions is
typically < 10.

**Verify**: existing `tests/integration/chat*.test.ts` pass. Add 1 test: "send message with mention emits notification to mentioned user" (assert `socket.io` `emitToUser` called with the new notif payload).

### Step 9 — full gate

`pnpm verify` (all 4 stages green per the baseline). Integration count
should be ≥ 246 (one new ai.cache test + one new chat.notif test).

## Test plan

- PERF-02: existing `tests/integration/chat.test.ts` covers channels + messages; no new test needed (verify no regression).
- PERF-03: existing `tests/integration/sprint.test.ts` (1 test) covers single sprint; add 1 test with 3 sprints and assert each row has the correct `taskCount` aggregate.
- PERF-04: existing `tests/integration/board-mgmt.test.ts` (3 tests) covers board partition; add 1 test that creates 60 tasks in one column and asserts the response has `taskCount: 60` and `tasks.length <= 50`.
- PERF-05: this is a web concern — no new test, rely on typecheck + build. (Existing E2E covers the happy path.)
- PERF-06: existing `tests/integration/task.routes.test.ts` + `task.service.test.ts` should pass; add 1 test that creates 100 tasks across 1 workspace and asserts the list query (with `position` order) returns in < 50ms locally.
- PERF-07: add 1 test `ai.service.test.ts: "second call hits cache"`.
- PERF-08: existing `tests/integration/webhook.test.ts` (9 tests) should pass with `addBulk` — no behavior change observable from the route's perspective. Add 1 test: "1 activity with 5 webhooks produces 5 deliveries" (verifies the loop behavior survived).
- PERF-09: add 1 test `chat.message.test.ts: "send with mention emits to mentioned user"`.

## Done criteria

- [ ] `pnpm --filter @flow-desk/api typecheck` exits 0
- [ ] `pnpm --filter @flow-desk/web typecheck` exits 0
- [ ] `pnpm --filter @flow-desk/api exec vitest run --config vitest.config.ts` exits 0
- [ ] `TEST_DB_PORT=5433 pnpm --filter @flow-desk/api exec vitest run --config vitest.integration.config.ts` exits 0; integration count ≥ 246
- [ ] `pnpm build` exits 0
- [ ] `grep -n "addBulk" apps/api/src/modules/activity/activity.service.ts` returns ≥ 1
- [ ] `grep -n "DISTINCT ON" apps/api/src/modules/chat/chat.repository.ts` returns ≥ 1
- [ ] `grep -n "@@index" packages/db/prisma/schema.prisma | grep -c position` returns ≥ 2
- [ ] `git status` shows only in-scope files
- [ ] `plans/README.md` row for 024 updated to `DONE`

## STOP conditions

- The webhook queue interface (`webhookQueue.addBulk`) does not exist in
  the version of BullMQ pinned — check `package.json` and confirm
  ≥ 4.0 before using it.
- The chat repository's callers expect a specific return shape; if the
  `DISTINCT ON` merge breaks the existing `findByWorkspace` callers
  (e.g. frontend expects `messages[0]`), wrap in a compatibility layer
  rather than restructuring callers.
- The migration on a populated DB: if `Task` already has millions of
  rows, `CREATE INDEX CONCURRENTLY` cannot run in a transaction — write
  the migration without `BEGIN`/`COMMIT` (Prisma's default is
  transaction-per-migration, so add `--createOnly` to the migrate cmd
  or hand-write the file without `BEGIN`).

## Maintenance notes

- The cache in Step 7 is invalidated on member-set change. If member
  roles change (e.g. promoted to admin), the suggestions list may be
  stale for up to 5 min — acceptable, the LLM is suggestion-only.
- PERF-04's `take: 50` cap is now explicit. The FE can render the
  `taskCount` field as "50 of 200" or hide the truncation. The FE work
  is in a follow-up — this plan only adds the data.
- The composite index in Step 6 also helps `GET /api/tasks?workspaceId=…`
  with no other filter (the "unfiltered list" path) — verify the existing
  task list integration test still passes.
