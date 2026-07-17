# Plan 031: Fix sprint task list; server filters for type/sprintId; paginate list/calendar/epics

> **Executor instructions**: Follow step by step. Verify each step. On STOP conditions, report — do not improvise. Update `plans/README.md` when done.
>
> **Drift check**:
> `git diff --stat 081cbc6..HEAD -- apps/api/src/modules/task/task.service.ts packages/shared/src/task.ts apps/web/src/features/sprint/components/SprintPage.tsx apps/web/src/pages/list.tsx apps/web/src/features/calendar/components/CalendarPage.tsx apps/web/src/features/task/components/EpicList.tsx apps/api/tests/integration`
> Mismatch with excerpts → STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (UX pagination)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `081cbc6`, 2026-07-15

## Why this matters

Sprint page requests `/tasks?…` (missing `/api`) and passes `sprintId` which the API strips — the sprint task pane is wrong. List, calendar, and epic UIs fetch a single page of 100 tasks and either client-filter or show incomplete data. The API already supports cursor pagination and date filters; the client must use them, and the API needs `sprintId` + `type` filters.

## Current state

### Broken sprint client

`apps/web/src/features/sprint/components/SprintPage.tsx` ~92–98:

```ts
api<{ data: SprintTask[] }>(
  `/tasks?workspaceId=${workspaceId}&limit=100&sprintId=${selected}`,
),
```

Other calls on same page correctly use `/api/workspaces/...`.

### List schema has no sprintId/type

`apps/api/src/modules/task/task.service.ts` `listTasksQuerySchema` / `buildTaskWhere` (~23–73): workspaceId, columnId, boardId, status, priority, assigneeId, search, dueBefore, dueAfter — **no** `sprintId`, **no** `type`.

Shared package mirror: `packages/shared/src/task.ts` `listTasksQuerySchema` (~141–153).

### FE hard-caps

- `apps/web/src/pages/list.tsx` ~161–187: single fetch `limit: '100'`, client-side status/priority filter, `nextCursor` ignored.
- `apps/web/src/features/calendar/components/CalendarPage.tsx` ~106–109: `limit=100`, no `dueAfter`/`dueBefore`.
- `apps/web/src/features/task/components/EpicList.tsx` ~36–59: `limit=100` then `filter(t => t.type === 'EPIC')`.

Task model has `sprintId`, `type` (`EPIC`/`STORY`/…), indexes exist on schema.

**Conventions**: shared Zod in `packages/shared`; API may re-export/extend same shapes. Cursor pagination exemplar: chat list / task list API. Prefer `useInfiniteQuery` if already used in chat — check `apps/web/src/features/chat/hooks.ts`. Keep API paths prefixed `/api`.

## Commands you will need

| Purpose            | Command                                                                         | Expected |
| ------------------ | ------------------------------------------------------------------------------- | -------- |
| Typecheck all      | `pnpm typecheck`                                                                | exit 0   |
| API integration    | `pnpm --filter @flow-desk/api test:integration`                                 | pass     |
| Web typecheck/lint | `pnpm --filter @flow-desk/web typecheck && pnpm --filter @flow-desk/web lint`   | exit 0   |
| Web unit           | `pnpm --filter @flow-desk/web test:unit` or `pnpm --filter @flow-desk/web test` | pass     |
| Full               | `pnpm verify`                                                                   | exit 0   |

## Scope

**In scope**:

- `packages/shared/src/task.ts` (+ rebuild shared if needed)
- `apps/api/src/modules/task/task.service.ts` (schema + `buildTaskWhere`)
- Integration test for list filters (`task.service.test.ts` or new cases)
- `apps/web/src/features/sprint/components/SprintPage.tsx`
- `apps/web/src/pages/list.tsx`
- `apps/web/src/features/calendar/components/CalendarPage.tsx`
- `apps/web/src/features/task/components/EpicList.tsx`
- Optional small shared hook under `apps/web/src/features/task/` if it reduces duplication

**Out of scope**:

- Virtualized tables (deferred)
- Export streaming (plan 033)
- Full CalendarPage UI rewrite / god-file split (plan deferred)
- Changing board kanban column task cap (50)

## Git workflow

- Commit example: `fix(tasks): sprintId/type filters + fix sprint/list/calendar/epic pagination`
- Do not push unless asked.

## Steps

### Step 1: API + shared filters

1. Add optional fields to **both** shared and API list schemas (keep them aligned):

```ts
sprintId: cuidSchema.optional(),
type: z.enum(['TASK', 'EPIC', 'STORY', 'SUBTASK'] /* Prisma TaskType */).optional(),
parentTaskId: cuidSchema.optional(), // optional but useful for epic children
```

Read `packages/db/prisma/schema.prisma` for exact `TaskType` / status enum values — use those strings only.

2. Extend `buildTaskWhere`:

```ts
...(query.sprintId ? { sprintId: query.sprintId } : {}),
...(query.type ? { type: query.type } : {}),
...(query.parentTaskId ? { parentTaskId: query.parentTaskId } : {}),
```

3. Rebuild shared package if monorepo requires it: `pnpm --filter @flow-desk/shared build` (or turbo dependsOn).

**Verify**:

```bash
pnpm --filter @flow-desk/shared typecheck
pnpm --filter @flow-desk/api typecheck
```

### Step 2: Integration tests for filters

Add tests (model after existing task list tests in `apps/api/tests/integration/task.service.test.ts`):

- Create tasks with different `type` / `sprintId`; `GET /api/tasks?type=EPIC` returns only epics.
- `GET /api/tasks?sprintId=X` returns only that sprint’s tasks.
- Non-member still 403 (existing membership path).

**Verify**: `pnpm --filter @flow-desk/api test:integration -- task` → pass.

### Step 3: Fix SprintPage

Change query to:

```ts
`/api/tasks?${new URLSearchParams({
  workspaceId,
  limit: '100',
  sprintId: selected!,
}).toString()}`;
```

Ensure response shape matches what SprintPage expects (`{ data: … }`). If API returns cursor envelope, map accordingly.

**Verify**: `rg -n "\`/tasks\\?" apps/web/src/features/sprint`→ no matches without`/api`.

### Step 4: EpicList server filter

```ts
`/api/tasks?workspaceId=${workspaceId}&limit=100&type=EPIC`;
```

For children, either:

- second query `parentTaskId=${epicId}` when expanded, or
- one query with higher limit for stories of loaded epics.

Minimum acceptable: epics via `type=EPIC`; stories via `parentTaskId` when expanding (avoids 100-task mix).

### Step 5: Calendar date window

When month/week changes, pass:

```ts
dueAfter: startOfVisibleRange.toISOString(),
dueBefore: endOfVisibleRange.toISOString(),
limit: '100', // or infinite scroll if many due same month
```

Use existing `dueAfter`/`dueBefore` on list API. If a task has only `startDate`, decide explicitly: either also filter in client for startDate overlap, or document that calendar is dueDate-based only (current page uses dueDate keys) — **match existing `dueDateKey` behavior**; do not invent dual-filter without API support.

### Step 6: List page pagination + server filters

1. Pass `status` / `priority` as query params when not ALL (remove client-only filter for those, or keep client filter only as defense in depth after server filter).
2. Implement “Load more” or infinite scroll with `nextCursor` from API.
   - Pattern: if chat uses `useInfiniteQuery`, copy that structure.
   - Minimum: a “Load more” button when `nextCursor` is non-null that appends the next page.

Do not silently drop pages past 100.

**Verify**:

```bash
pnpm --filter @flow-desk/web typecheck
pnpm --filter @flow-desk/web lint
```

## Test plan

- API: type + sprintId filter integration tests (required).
- Web: at least one unit test if easy (SprintPage URL construction) — optional if pure TS string; prioritize API tests.
- Manual smoke after `pnpm dev`: sprint select shows only sprint tasks; epic page lists only EPIC; calendar month with >100 workspace tasks still shows tasks due that month (if ≤100 due in range).

## Done criteria

- [ ] `sprintId` and `type` on list schema (shared + API) and `buildTaskWhere`
- [ ] SprintPage uses `/api/tasks` + sprintId
- [ ] EpicList requests `type=EPIC` (not client-only among mixed 100)
- [ ] Calendar uses date window params
- [ ] List page can fetch beyond first 100 via cursor
- [ ] Integration tests for filters green
- [ ] typecheck web + api green
- [ ] `plans/README.md` 031 → DONE

## STOP conditions

- TaskType enum values differ from assumed strings — read schema and use exact enum.
- List page architecture makes infinite query a multi-day rewrite → implement Load more button only; do not rewrite table virtualization.
- Shared package is the sole schema source and API imports it — then edit only shared and remove duplicate API schema if already dual (prefer single source of truth already in repo).

## Maintenance notes

- Reviewers: confirm Zod strips unknown keys no longer hide sprintId.
- Future: virtualize list table when pages get large.
- Board view still caps 50 tasks/column with taskCount — out of scope.
