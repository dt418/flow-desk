# Plan 025: Tech-debt refactor (dead code + god file + duplication)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 870c8ed..HEAD -- apps/api/src/shared/lib/socket.ts apps/api/src/shared/lib/socket-events.ts apps/api/src/modules/task apps/api/src/modules/chat apps/api/src/shared/lib/access.ts`
> If any in-scope file changed, compare "Current state" excerpts against
> the live code before proceeding; on a mismatch, treat it as a STOP
> condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW–MED
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `870c8ed`, 2026-07-11

## Why this matters

Four HIGH-confidence tech-debt findings:

1. `safeEmit` wrapper is dead weight — 25/25 call sites ignore the
   return value, so the try/catch layer produces no observed effect.
2. `task.service.ts` is 743 lines (11.6× the API median of 64), holding
   12 methods across CSV export, dependency mgmt, activity diff, and
   assignee email orchestration. Highest churn risk of any backend file.
3. Three near-identical "rate-limit + assertMembership + join room"
   blocks in `socket.ts` (`join-workspace`, `join-task`,
   `conversation:join`, plus `message:read`).
4. Three hand-rolled chat message event-payload builders in
   `chat.message.service.ts` and `socket.ts` that drift independently.

None change observable behavior. All reduce surface area for future
bugs.

## Current state

### ARCH-01 — `safeEmit` wrapper is dead

`apps/api/src/shared/lib/socket-events.ts:59-70`:

```ts
export function safeEmit(...args) {
  try { return { ok: true, ...emit(...args) }; }
  catch (error) { logger.warn(...); return { ok: false, error }; }
}
```

Callers (verified by grep, 25 sites):

- `apps/api/src/modules/task/task.service.ts:221, 269, 273, 287, 291, 305,
309, 416, 420, 471, 475, 524, 717` — 13 sites
- `apps/api/src/modules/chat/chat.message.service.ts:137, 179, 229, 274` — 4 sites
- `apps/api/src/modules/comment/comment.service.ts:121, 165, 199, 218` — 4 sites

(Approximate; exact line numbers are in scope for the executor to re-verify.)

The chat module's three sites at `chat.message.service.ts` actually do
check the return value, per the audit — these are kept as direct emit +
`logger.warn` on throw.

### ARCH-02 — `task.service.ts` is a god file

`apps/api/src/modules/task/task.service.ts` — 743 lines, 12 methods:

- `list`, `exportTasks`, `create`, `get`, `update`, `delete`, `restore`,
  `move`, `createSubtask`, `createDependency`, `deleteDependency`.
- Private helpers `recordUpdateDiff` (lines ~538-679) and
  `handleAssigneeChange` (lines ~685-743).
- The `csvEscapeField` / `serializeTaskCsvRow` helpers used by
  `exportTasks` are CSV-specific.

### ARCH-03 — three near-identical join handlers

`apps/api/src/shared/lib/socket.ts`:

- `join-workspace` handler (~lines 140-165)
- `join-task` handler (~lines 175-205)
- `conversation:join` handler (~lines 220-260)
- `message:read` handler (~lines 312-316)

All four: rate-limit check → `findUnique` for the resource →
`workspaceMember.findUnique` → `socket.join(room)`. The rate-limit
error envelope `{ type: 'rate_limit', message, retryAfterMs }` is
rebuilt four times.

### ARCH-05 — chat message serialize is hand-rolled 3×

- `apps/api/src/modules/chat/chat.message.service.ts:178-209` (updateMessage)
- `apps/api/src/modules/chat/chat.message.service.ts:222-238` (deleteMessage)
- `apps/api/src/shared/lib/socket.ts:368-382` (message:send handler)

Each builds the same `id, channelId, authorId, content, mentionedUserIds,
clientMessageId, createdAt, updatedAt, editedAt, author{...}` payload.

### Repo conventions

- Service files are co-located: `apps/api/src/modules/<feature>/<name>.ts`
  (see the 18+ modules). Helpers inside a service are private (not
  exported).
- Exports from a service go to the route file: `import { taskService }
from './task.service'`.
- Logger: `import { logger } from '../../shared/lib/logger'`.
- Errors: `import { BadRequestError, ... } from '../../shared/errors'`.

## Commands you will need

| Purpose   | Command                                                                                                | Expected on success |
| --------- | ------------------------------------------------------------------------------------------------------ | ------------------- |
| Typecheck | `pnpm --filter @flow-desk/api typecheck`                                                               | exit 0              |
| Unit      | `pnpm --filter @flow-desk/api exec vitest run --config vitest.config.ts`                               | all pass            |
| Integ     | `TEST_DB_PORT=5433 pnpm --filter @flow-desk/api exec vitest run --config vitest.integration.config.ts` | all pass            |
| Build     | `pnpm build`                                                                                           | exit 0              |

## Scope

**In scope**:

- `apps/api/src/shared/lib/socket-events.ts` (ARCH-01: drop safeEmit)
- `apps/api/src/modules/task/task.service.ts` (ARCH-01: replace safeEmit calls)
- `apps/api/src/modules/task/task.routes.ts` (ARCH-01: replace safeEmit calls if any)
- `apps/api/src/modules/comment/comment.service.ts` (ARCH-01: replace safeEmit calls)
- `apps/api/src/modules/chat/chat.message.service.ts` (ARCH-01 keep with explicit try; ARCH-05 serialize)
- `apps/api/src/shared/lib/socket.ts` (ARCH-05 serialize: import the new helper)
- `apps/api/src/modules/task/task.service.ts` (ARCH-02: extract `recordUpdateDiff` to `activity/activity-diff.ts` and `handleAssigneeChange` to `task/task-assignee.ts` and CSV helpers to `task/task-csv.ts`)
- `apps/api/src/modules/activity/activity-diff.ts` (ARCH-02: new file)
- `apps/api/src/modules/task/task-assignee.ts` (ARCH-02: new file)
- `apps/api/src/modules/task/task-csv.ts` (ARCH-02: new file)
- `apps/api/src/shared/lib/access.ts` (ARCH-03: add `assertWorkspaceMember` helper)
- `apps/api/src/shared/lib/socket.ts` (ARCH-03: use the new helper in all 4 join handlers)

**Out of scope**:

- `apps/api/src/shared/lib/socket.ts`'s 434-line transport setup (separate concern; ARCH-04 noted but not in scope).
- Any behavior change to the socket event payloads (visible to FE).
- `apps/api/src/modules/chat/chat.service.ts` (the channel module) — `chat.message.service.ts` only.
- Re-running the full `pnpm verify` after each step — typecheck + unit + integration per step is enough; the full gate runs once at the end.

## Git workflow

- Branch: `advisor/025-tech-debt-refactor`
- One commit per step. Conventional commits: `refactor(chat): drop dead safeEmit wrapper`, `refactor(task): extract recordUpdateDiff`, etc.
- Do NOT push or open a PR.

## Steps

### Step 1 — ARCH-01: drop `safeEmit`

In `apps/api/src/shared/lib/socket-events.ts:59-70`, delete the
`safeEmit` function (the `export function safeEmit(...)` block).

In each of the 25 call sites listed in "Current state", replace
`safeEmit(...)` with the underlying `emitToWorkspace(...)` /
`emitToTask(...)` / `emitToUser(...)` call directly. Example:

```ts
// before
safeEmit(emitToWorkspace, 'task:created', workspaceId, payload);
// after
emitToWorkspace('task:created', workspaceId, payload);
```

For the 3 chat module call sites that **do** check the return value
(`chat.message.service.ts:137, 179, 229, 274`), keep the try/catch
inline:

```ts
try { emitToWorkspace(...); } catch (e) { logger.warn({ ... }, 'emit failed'); }
```

`grep -n "safeEmit" apps/api/src/` should return 0 matches after this step.

**Verify**: `pnpm --filter @flow-desk/api typecheck` → exit 0. `pnpm --filter @flow-desk/api exec vitest run --config vitest.config.ts` → exit 0 (the existing 138 unit tests must pass — `safeEmit` had no unit tests, but the integration tests cover the emit paths).

### Step 2 — ARCH-02a: extract `recordUpdateDiff`

Create `apps/api/src/modules/activity/activity-diff.ts` with the
contents of `task.service.ts` `recordUpdateDiff` (private, lines
~538-679). Export as `recordUpdateDiff`. Add the necessary imports
to the new file (logger, prisma, activity service, etc.).

In `task.service.ts`:

- Remove the private function.
- Add `import { recordUpdateDiff } from '../activity/activity-diff';`
- Replace internal calls with `recordUpdateDiff(...)`.

**Verify**: `pnpm --filter @flow-desk/api typecheck` → exit 0. Existing task service tests pass.

### Step 3 — ARCH-02b: extract `handleAssigneeChange`

Create `apps/api/src/modules/task/task-assignee.ts` with the
contents of `handleAssigneeChange` (lines ~685-743). Export as
`handleAssigneeChange`. Move the inline
`process.env.APP_URL ?? 'http://localhost:3000'` to a module-level
constant or a tiny `config.ts` next to the new file.

**Verify**: typecheck + existing `task.service.test.ts` (29 tests) pass.

### Step 4 — ARCH-02c: extract CSV helpers

Create `apps/api/src/modules/task/task-csv.ts` with `csvEscapeField`
and `serializeTaskCsvRow`. Export both. The new file is a pure
helper — no prisma imports needed.

**Verify**: existing `task-export.test.ts` (13 tests) pass.

After all three extractions, `wc -l apps/api/src/modules/task/task.service.ts`
should be ≤ 450 (target: ~400).

### Step 5 — ARCH-03: extract `assertWorkspaceMember` for socket join handlers

In `apps/api/src/shared/lib/access.ts`, add a new exported helper:

```ts
export async function assertWorkspaceMember(userId: string, workspaceId: string): Promise<boolean> {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { id: true },
  });
  return Boolean(member);
}
```

In `apps/api/src/shared/lib/socket.ts`, replace the four join handlers
(`join-workspace`, `join-task`, `conversation:join`, `message:read`) to
call this helper instead of inlining the lookup. The rate-limit
error envelope can stay inline (it's only 5 lines and the
`retryAfterMs` value varies by call site).

**Verify**: existing `tests/integration/socket.test.ts` (or wherever
realtime-gateway tests live) pass.

### Step 6 — ARCH-05: extract `serializeChatMessageForSocket`

Create `apps/api/src/modules/chat/chat-serialize.ts`:

```ts
export function serializeChatMessageForSocket(msg: ChatMessage & { author?: ... }): SocketMessagePayload {
  return {
    id: msg.id,
    channelId: msg.channelId,
    authorId: msg.authorId,
    content: msg.content,
    mentionedUserIds: msg.mentionedUserIds,
    clientMessageId: msg.clientMessageId,
    createdAt: msg.createdAt,
    updatedAt: msg.updatedAt,
    editedAt: msg.editedAt,
    author: msg.author ? { id: msg.author.id, name: msg.author.name, avatarUrl: msg.author.avatarUrl } : undefined,
  };
}
```

Replace the three hand-rolled payload builders with this helper:

- `chat.message.service.ts:178-209` (updateMessage)
- `chat.message.service.ts:222-238` (deleteMessage)
- `socket.ts:368-382` (message:send handler)

**Verify**: existing chat integration tests (in `tests/integration/chat*` — at least 3 files) pass.

### Step 7 — full gate

`pnpm verify` — all 4 stages green. No new tests added; this is
purely refactor with zero behavior change.

## Test plan

- No new tests. Every step relies on existing tests to confirm zero
  behavior change. The relevant test files:
  - `tests/integration/task*.test.ts` (10+ tests across 4 files)
  - `tests/integration/chat*.test.ts` (3+ files)
  - `tests/integration/socket.test.ts` (1 file, 6 tests)
  - `tests/integration/automation.test.ts` (3 tests)
  - `tests/integration/task-export.test.ts` (13 tests)

If a test fails after any step, that step is a STOP condition — the
refactor is wrong, do not improvise.

## Done criteria

- [ ] `pnpm --filter @flow-desk/api typecheck` exits 0
- [ ] `pnpm --filter @flow-desk/api exec vitest run --config vitest.config.ts` exits 0
- [ ] `TEST_DB_PORT=5433 pnpm --filter @flow-desk/api exec vitest run --config vitest.integration.config.ts` exits 0; integration count == 250 (no new tests, no lost tests)
- [ ] `pnpm build` exits 0
- [ ] `grep -rn "safeEmit" apps/api/src/` returns 0 matches
- [ ] `wc -l apps/api/src/modules/task/task.service.ts` ≤ 450
- [ ] `grep -n "workspaceMember.findUnique" apps/api/src/shared/lib/socket.ts` ≤ 1 (only in the new helper call)
- [ ] `git status` shows only in-scope files
- [ ] `plans/README.md` row for 025 updated to `DONE`

## STOP conditions

- The `safeEmit` call signature is not what the audit shows — re-verify
  with `grep -rn "safeEmit" apps/api/src/`.
- The `recordUpdateDiff` helper has closures over `this` (it shouldn't,
  but verify) — if it does, extraction breaks the binding.
- The socket join handler refactor breaks the FE's `joinWorkspace` /
  `joinTask` semantics — verify by reading
  `apps/web/src/features/realtime/useRealtime.ts` and confirming the
  emit shape is unchanged.
- `serializeChatMessageForSocket` includes fields the FE doesn't
  expect — check the existing snapshot of the wire shape in any
  Playwright test that asserts on socket frames.

## Maintenance notes

- ARCH-01 (drop safeEmit) is the highest-leverage change: 25 dead code
  sites × 1 function deleted = the codebase gets smaller and a future
  reader doesn't have to wonder why the wrapper exists.
- ARCH-02a-c (god file split) is preparation for ARCH-04 (lib/ drift)
  in a future audit. Smaller modules = fewer reasons for the next
  contributor to add to the god file.
- ARCH-03 and ARCH-05 are pure extractions; if a reviewer flags a
  behavior change, that's a real bug in the audit and a STOP.
- If `ARCH-04` (dynamic imports in `socket.ts`) is taken up later, the
  new `chat-serialize.ts` and `access.ts` helpers are the right shape
  for the migration.
