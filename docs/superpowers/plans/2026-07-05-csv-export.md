# CSV Export (P1-3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stream CSV export of filtered task list — `GET /api/tasks/export?workspaceId=…&<filters>` → RFC 4180 CSV with 6 columns (Status, Title, Assignee Email, Priority, Due Date, Labels). Web "Export CSV" button on list page exports current filter state.

**Design spec:** `docs/superpowers/specs/2026-07-05-csv-export-design.md` (approved 2026-07-05).

**Architecture:** No new model, no migration (read-only feature). Reuses `listTasksQuerySchema` via `.omit({cursor,limit})` — one filter shape, drift-proof. Adds `exportTasks()` to `task.service.ts` + `GET /export` to `taskRouter` (registered before `GET /:id`). Streaming via `ReadableStream` from async generator over one `findMany`. Web: one button in list toolbar, `window.location.href` triggers browser download via `Content-Disposition`.

**Tech Stack:** Hono + Zod + Prisma (existing), `ReadableStream` (Node 18+ global). No new deps.

## Locked decisions (from brainstorming — do not revisit)

- **D1 Route:** `GET /api/tasks/export?workspaceId=…` — query-param-scoped, NOT path-scoped. Schema-hygiene checklist rule.
- **D2 Schema:** `listTasksQuerySchema.omit({ cursor: true, limit: true })`. Keep `sortBy`/`sortOrder` (serializer ignores, shape stays unified).
- **D3 Route order:** `GET /export` registered BEFORE `GET /:id` in `taskRouter`. Else `export` swallowed as `:id`.
- **D4 Access:** `assertMembership(query.workspaceId, userId)` — already query-param-driven, reuse.

## Global Constraints

- Schema hygiene (AGENTS.md §Future-Sprint): no `board` in names; no Task field changes; no migration; filter-by-parameter.
- Module layout: export lives IN existing `task` module (no new `export` module — it's `listTasks` + serializer).
- Zod schema in `packages/shared/src/task.ts` (extend existing file, not new module).
- Labels from `TaskLabelAssignment` join → `TaskLabel.name` (schema.prisma:238). NOT `labelsDeprecated`. Code comment cites line at mapping site.
- CSV escaping runs on JOINED labels string (after `join(';')`), not per-label.
- Due Date null guard explicit: `task.dueDate ? task.dueDate.toISOString() : ''`. No coercion.
- Enum values as-is (`IN_PROGRESS`, `HIGH`) — no humanizing (round-trippable).
- UTF-8 BOM + `\r\n` (Excel-friendly).
- One feature `in_progress` in `feature_list.json` at a time.
- Web test ships with feature (F8 pattern).

---

## File Structure

**Shared (packages/shared):**

- `packages/shared/src/task.ts` — Modify: add `exportTasksQuerySchema = listTasksQuerySchema.omit({cursor:true, limit:true})` + type export.

**Backend (apps/api):**

- `apps/api/src/modules/task/task.service.ts` — Modify: extract `buildTaskWhere(query)` shared by `list`+`exportTasks`; add `exportTasks(query, userId)`; add `csvEscapeField(s)` + `serializeTaskCsvRow(task)`.
- `apps/api/src/modules/task/task.routes.ts` — Modify: add `GET /export` BEFORE `GET /:id`; `zValidator('query', exportTasksQuerySchema)`; stream response.
- `apps/api/tests/integration/task-export.test.ts` — Create: 13 integration tests.

**Frontend (apps/web):**

- `apps/web/src/features/task/api.ts` — Modify: add `exportTasksCsv(params)` — build URL, `window.location.href = url`.
- `apps/web/src/pages/list.tsx` — Modify: add "Export CSV" `<Button>` in toolbar after `SavedViewsBar`; onClick calls `exportTasksCsv({workspaceId, status, priority})`.
- `apps/web/src/features/task/components/ExportCsvButton.test.tsx` — Create: 2 component tests.

**Artifacts:**

- `feature_list.json` — Modify: add `P1-3` entry, set `in_progress` then `passing`.
- `claude-progress.md` — Modify: append Session 028 record.

---

## Task 1 — Shared export schema

**Why first:** Backend + web both import it. Build shared first so downstream tasks have the type.

- [ ] **1.1** Open `packages/shared/src/task.ts`. Locate `listTasksQuerySchema` (line ~123). Add below it:
  ```ts
  export const exportTasksQuerySchema = listTasksQuerySchema.omit({
    cursor: true,
    limit: true,
  });
  export type ExportTasksQuery = z.infer<typeof exportTasksQuerySchema>;
  ```
- [ ] **1.2** Verify `ExportTasksQuery` exported from `packages/shared/src/index.ts` (re-export already covers `./task` — check).
- [ ] **1.3** `pnpm --filter @flow-desk/shared build` → exit 0, DTS emits `export-tasks` types? No new entry needed — same `./task` export. Confirm build green.

**Verify:** `pnpm --filter @flow-desk/shared build` exit 0. `grep exportTasksQuerySchema packages/shared/dist/task.mjs` → 1 match.

---

## Task 2 — Backend service: buildTaskWhere + exportTasks + CSV helpers

**Why:** Core logic. Service returns row array; route streams it.

- [ ] **2.1** In `apps/api/src/modules/task/task.service.ts`, extract shared `where` builder. Current `list()` builds `where: Prisma.TaskWhereInput` inline (lines ~44-60). Extract to:
  ```ts
  function buildTaskWhere(query: {
    columnId?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    assigneeId?: string;
    search?: string;
    dueBefore?: string;
    dueAfter?: string;
  }): Prisma.TaskWhereInput {
    return {
      workspaceId: query.workspaceId,
      ...(query.columnId ? { columnId: query.columnId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
      ...(query.dueBefore || query.dueAfter
        ? {
            dueDate: {
              ...(query.dueBefore ? { lte: new Date(query.dueBefore) } : {}),
              ...(query.dueAfter ? { gte: new Date(query.dueAfter) } : {}),
            },
          }
        : {}),
    };
  }
  ```
  Refactor `list()` to call `buildTaskWhere(query)`. Ensure `workspaceId` is in the query type (it's on `ListTasksQuery`).
- [ ] **2.2** Add CSV helpers:
  ```ts
  function csvEscapeField(s: string): string {
    // RFC 4180: wrap in quotes + double embedded quotes iff field has , " \r \n
    if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }
  ```
- [ ] **2.3** Add row serializer:
  ```ts
  // Task shape: prisma.task.findMany with include { assignee: {select:{email:true}}, assignments: { include: { label: { select: { name: true } } } } }
  function serializeTaskCsvRow(task: {
    status: string;
    title: string;
    priority: string;
    dueDate: Date | null;
    assignee: { email: string } | null;
    assignments: { label: { name: string } }[];
  }): string {
    // Canonical source = TaskLabelAssignment join (schema.prisma:238).
    // labelsDeprecated is the F2 dual-write legacy array kept for migration
    // safety — do not read from it here; it can leak stale label names.
    const labels = task.assignments.map((a) => a.label.name).join(';');
    const fields = [
      task.status,
      task.title,
      task.assignee?.email ?? '',
      task.priority,
      task.dueDate ? task.dueDate.toISOString() : '',
      labels,
    ];
    return fields.map(csvEscapeField).join(',') + '\r\n';
  }
  ```
- [ ] **2.4** Add `exportTasks(query, userId)` to `taskService`:
  ```ts
  async exportTasks(query: ExportTasksQuery, userId: string) {
    await assertMembership(query.workspaceId, userId);
    const where = buildTaskWhere(query);
    return prisma.task.findMany({
      where,
      include: {
        assignee: { select: { email: true } },
        assignments: { include: { label: { select: { name: true } } } },
      },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
  }
  ```
  Import `ExportTasksQuery` from `@flow-desk/shared/task`.
- [ ] **2.5** Export `serializeTaskCsvRow` + `csvEscapeField` from service (route needs them). Or move to a small `task.csv.ts` helper in the module — prefer keeping in service to avoid new file.

**Verify:** `pnpm --filter @flow-desk/api typecheck` exit 0. `grep buildTaskWhere task.service.ts` → 2 matches (def + call in list). `grep exportTasks task.service.ts` → 2 matches (def + the `taskService` object key).

---

## Task 3 — Backend route: GET /export + stream

**Why:** Wire service to HTTP. Route order critical (D3).

- [ ] **3.1** In `apps/api/src/modules/task/task.routes.ts`, import `exportTasksQuerySchema`, `serializeTaskCsvRow` from service. Import `z` if not already.
- [ ] **3.2** Register `GET /export` AFTER `GET /` (line 23) and BEFORE `GET /:id` (line 49):

  ```ts
  taskRouter.get(
    '/export',
    zValidator('query', exportTasksQuerySchema, (result, c) => {
      if (!result.success) return c.json({ error: result.error.flatten() }, 400);
    }),
    async (c) => {
      const auth = c.get('auth');
      const query = c.req.valid('query');
      const rows = await taskService.exportTasks(query, auth.user.id);

      // Fetch workspace slug for filename (cheap, one query)
      const ws = await prisma.workspace.findUnique({
        where: { id: query.workspaceId },
        select: { slug: true },
      });
      const slug = ws?.slug ?? query.workspaceId;
      const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15); // yyyyMMddHHmm
      const filename = `tasks-${slug}-${stamp}.csv`;

      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          // UTF-8 BOM so Excel opens UTF-8 correctly
          controller.enqueue(encoder.encode('\uFEFF'));
          // Header row
          controller.enqueue(
            encoder.encode('Status,Title,Assignee Email,Priority,Due Date,Labels\r\n'),
          );
          for (const row of rows) {
            controller.enqueue(encoder.encode(serializeTaskCsvRow(row)));
          }
          controller.close();
        },
      });

      c.header('Content-Type', 'text/csv; charset=utf-8');
      c.header('Content-Disposition', `attachment; filename="${filename}"`);
      return c.body(stream);
    },
  );
  ```

- [ ] **3.3** Confirm `prisma` import already at top of routes file (it is — used by other handlers). If not, import from `../../shared/lib/prisma`.
- [ ] **3.4** Confirm route order by reading file: `GET /` → `GET /export` → `GET /:id`. Run `grep -n "taskRouter.get\|taskRouter.post" task.routes.ts | head -5` and verify `/export` line number < `/:id` line number.

**Verify:** `pnpm --filter @flow-desk/api typecheck` exit 0. Route order grep confirms `/export` before `/:id`.

---

## Task 4 — Backend integration tests

**Why:** 13 tests cover filter correctness + CSV format + edge cases + access.

- [ ] **4.1** Create `apps/api/tests/integration/task-export.test.ts`. Follow `saved-filter.test.ts` setup pattern (import test db, factories, auth helper).
- [ ] **4.2** Tests:
  1. Export all tasks in workspace → 200, `text/csv` content-type, `Content-Disposition: attachment`, header row + N data rows, row count = `prisma.task.count({where:{workspaceId}})`.
  2. Filter `status=IN_REVIEW` → only IN_REVIEW rows.
  3. Filter `priority=HIGH` → only HIGH rows.
  4. Filter `assigneeId=<memberId>` → only that member's tasks; unassigned excluded.
  5. Empty result (filter matches nothing) → 200, header row only, no data rows.
  6. Unassigned task → "Assignee Email" column empty string.
  7. Null `dueDate` → "Due Date" column empty string.
  8. Task with 2 labels → Labels column = `label1;label2`.
  9. Label name with comma (`foo, bar`) → Labels field quoted: `"foo, bar"`, comma preserved.
  10. Title with comma + quote (`He said "hi", then left`) → RFC 4180 escaping: `"He said ""hi"", then left"`.
  11. Non-member → 400 (`Not a member of this workspace`).
  12. Missing `workspaceId` → 400 (Zod).
  13. UTF-8 BOM present as first 3 bytes of response body (`\uFEFF`).
- [ ] **4.3** Use factories: `createUser`, `createWorkspace`, `createTask` (with assignments + labels via `createLabel` + `prisma.taskLabelAssignment.create`). For CSV content assertions, read response as text, split on `\r\n`, assert header + row fields.
- [ ] **4.4** Run: `pnpm --filter @flow-desk/api test:integration -- task-export` → all pass.

**Verify:** 13/13 pass. `pnpm --filter @flow-desk/api test:integration` → all pass (no regression — was 207/207).

---

## Task 5 — Web: exportTasksCsv api + ExportCsvButton + wire list.tsx

**Why:** UI integration. One button, server-side download.

- [ ] **5.1** In `apps/web/src/features/task/api.ts`, add:
  ```ts
  export function exportTasksCsv(params: {
    workspaceId: string;
    status?: string;
    priority?: string;
  }): void {
    const qs = new URLSearchParams({ workspaceId: params.workspaceId });
    if (params.status && params.status !== 'ALL') qs.set('status', params.status);
    if (params.priority && params.priority !== 'ALL') qs.set('priority', params.priority);
    // Browser handles download via Content-Disposition: attachment
    window.location.href = `/api/tasks/export?${qs.toString()}`;
  }
  ```
- [ ] **5.2** In `apps/web/src/pages/list.tsx`, add button in toolbar AFTER `<SavedViewsBar>` and BEFORE the Board/List toggle:
  ```tsx
  <Button
    type="button"
    variant="ghost"
    size="sm"
    className="h-8 gap-1 text-xs"
    onClick={() => exportTasksCsv({ workspaceId, status: statusFilter, priority: priorityFilter })}
  >
    <Download className="h-3.5 w-3.5" />
    Export CSV
  </Button>
  ```
  Import `exportTasksCsv` from `@/features/task/api`. Import `Download` from `lucide-react`.
- [ ] **5.3** Confirm `/api/tasks/export` resolves correctly in dev (Vite proxy to :3000) and prod (nginx /api/ proxy). No new proxy config needed — `/api/*` already proxied.

**Verify:** `pnpm --filter @flow-desk/web typecheck` exit 0. `pnpm --filter @flow-desk/web build` exit 0.

---

## Task 6 — Web component test

**Why:** F8 pattern — feature ships with test.

- [ ] **6.1** Create `apps/web/src/features/task/components/ExportCsvButton.test.tsx`. Pattern: `workspace-create-dialog.test.tsx` (RHF + QueryClientProvider + MemoryRouter + mocked `@/lib/api`).
- [ ] **6.2** Tests:
  1. Renders button with "Export CSV" label + Download icon.
  2. Click calls `exportTasksCsv` with current filter params (mock `window.location.href` setter; assert URL built correctly with `workspaceId` + `status` + `priority` when not ALL; assert `status`/`priority` omitted when ALL).
- [ ] **6.3** Since `exportTasksCsv` is a plain function (not a hook), test the button by mocking the module: `vi.mock('@/features/task/api', () => ({ exportTasksCsv: vi.fn() }))`. Render button, click, assert mock called with expected params.

**Verify:** `pnpm --filter @flow-desk/web test -- --run` → all pass (23 existing + 2 new = 25).

---

## Task 7 — feature_list.json + claude-progress.md + verify

**Why:** Definition of Done requires evidence + restartable repo.

- [ ] **7.1** Add `P1-3` entry to `feature_list.json` `features` array. Set status `in_progress` BEFORE starting Task 1 (or now, retroactively — only one in_progress at a time, confirmed none currently). Fields:
  ```json
  {
    "id": "P1-3",
    "priority": 88,
    "area": "export",
    "title": "CSV export of filtered task list",
    "user_visible_behavior": "User clicks 'Export CSV' on list page → browser downloads tasks-{slug}-{timestamp}.csv with 6 columns (Status, Title, Assignee Email, Priority, Due Date, Labels) for the current filter set. Opens in Excel/Numbers.",
    "status": "in_progress",
    "verification": [...],
    "evidence": [...],
    "notes": ""
  }
  ```
- [ ] **7.2** After all tasks + verify green, update status to `passing`, fill `verification` + `evidence` arrays with actual command output (test counts, curl smoke result).
- [ ] **7.3** Append Session 028 record to `claude-progress.md` (normal verbosity — read outside session). Include: date, feature, what was done per task, commits, verified commands + counts, risk/bug found (none expected — no schema change), next step (P1-4 webhooks).
- [ ] **7.4** Run full verify:
  ```bash
  pnpm --filter @flow-desk/shared build
  pnpm --filter @flow-desk/api typecheck
  pnpm --filter @flow-desk/api lint
  pnpm --filter @flow-desk/api test:integration
  pnpm --filter @flow-desk/web typecheck
  pnpm --filter @flow-desk/web lint
  pnpm --filter @flow-desk/web test -- --run
  pnpm --filter @flow-desk/web build
  pnpm verify
  ```
  All green. Record counts in evidence.
- [ ] **7.5** Smoke test (host-side tsx on :3001 vs dev DB, per P1-1/P1-2 pattern):
  ```bash
  # In one terminal: tsx watch apps/api/src/index.ts (or docker compose up api)
  curl -b cookie.txt 'http://localhost:3001/api/tasks/export?workspaceId=<demo>' -o /tmp/export.csv
  file /tmp/export.csv  # text/csv
  head -3 /tmp/export.csv  # BOM + header + first row
  wc -l /tmp/export.csv  # 51 rows + header = 52
  ```
  Record in evidence.
- [ ] **7.6** Stage ONLY P1-3 files (NOT the dirty `TaskEditModal.tsx`):
  ```bash
  git add packages/shared/src/task.ts \
    apps/api/src/modules/task/task.service.ts \
    apps/api/src/modules/task/task.routes.ts \
    apps/api/tests/integration/task-export.test.ts \
    apps/web/src/features/task/api.ts \
    apps/web/src/pages/list.tsx \
    apps/web/src/features/task/components/ExportCsvButton.test.tsx \
    docs/superpowers/specs/2026-07-05-csv-export-design.md \
    docs/superpowers/plans/2026-07-05-csv-export.md \
    feature_list.json claude-progress.md
  ```
  Commit per-task (mirror P1-2: one commit per task) or as one feature commit. Pre-commit hook (lefthook) runs secret scan + typecheck — will pass.
- [ ] **7.7** Leave repo restartable: `./init.sh` clean, no broken state, dirty `TaskEditModal.tsx` left untouched (not P1-3 scope).

**Verify:** All gates green. Smoke CSV has 51 rows + header. `feature_list.json` P1-3 = passing. `claude-progress.md` Session 028 appended.

---

## Self-Review (run after writing, fix inline)

- [ ] Route order verified (D3) — `/export` before `/:id`.
- [ ] `buildTaskWhere` shared by `list` + `exportTasks` (one filter path).
- [ ] Labels from join table, comment cites schema.prisma:238.
- [ ] CSV escape runs on joined labels string.
- [ ] Due Date null guard explicit ternary.
- [ ] No `any` types.
- [ ] No new dependencies.
- [ ] No schema migration.
- [ ] Schema-hygiene checklist all 5 boxes ticked.
- [ ] Dirty `TaskEditModal.tsx` not staged in P1-3 commits.

---

## Execution order

T1 → T2 → T3 → T4 (parallel with T5 if subagent-driven) → T5 → T6 → T7.

T4 and T5/T6 can parallelize (backend tests vs web UI) if using subagent-driven-development. Otherwise sequential — feature is small (~0.5d), sequential is fine.

## Risk / known issue

None expected. No schema change, no migration, read-only feature. Only hazard = route order (D3) — caught in plan. If `ReadableStream` + `c.body()` has issues on the Hono/Node version in use, fallback: build CSV string + `c.text(csvString, 200, {'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': ...})` — violates "no in-memory build" for very large workspaces but unblocks. P1-3 scope (small workspaces) tolerates fallback; log it as tech debt if used.
