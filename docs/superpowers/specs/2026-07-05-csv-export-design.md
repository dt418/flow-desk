# Design — P1-3 CSV Export

**Date**: 2026-07-05
**Status**: pending-approval
**Scope**: 1 bounded feature, single plan (~0.5d)
**Roadmap source**: ROADMAP.md §Phase 1 P1-3 (priority 88)
**Brainstorming**: 4-question grill, all locks recorded below

## Problem

List page (`apps/web/src/pages/list.tsx`) has filters, saved views, and a data table, but no way to export the filtered task set. ROADMAP P1-3 calls for `GET /api/workspaces/:id/tasks/export?format=csv` streaming CSV with status/title/assignee-email/priority/dueDate/labels, plus an "Export CSV" button on the list page.

## Locked decisions (from brainstorming)

### D1 — Route shape: query-param-scoped, not path-scoped

`GET /api/tasks/export?workspaceId=…&<filters>` under the existing `taskRouter` in `apps/api/src/modules/task/`.

**Not** `/api/workspaces/:id/tasks/export` (ROADMAP literal). Reason: AGENTS.md "Future-Sprint Schema Hygiene" checklist explicitly forbids baking workspace-as-scope into the URL — "Filter by parameter, not hardcoded scope. `listTasks(workspaceId, filters)` not `listTasksForWorkspaceX()` baked into SQL. A future `boardId` arg extends the signature instead of forcing a rewrite." The existing list endpoint `GET /api/tasks?workspaceId=…` already follows the query-param pattern; export matches it. "Same filter signature as the list endpoint" (ROADMAP) is satisfied _literally_, not approximated. Board (`/api/workspaces/:wid/board`) earns path-scoping because it's a distinct aggregate (columns + tasks); export is just `listTasks` with a different output serializer.

ROADMAP wording amended-by-decision: behavior identical, route shape changed to honor the written checklist rule.

### D2 — Schema reuse: `omit`, not duplicate

```ts
export const exportTasksQuerySchema = listTasksQuerySchema.omit({ cursor: true, limit: true });
```

`sortBy` / `sortOrder` stay in the export schema even though the CSV serializer ignores them. One accepted shape for both endpoints; the two schemas cannot drift when someone adds a filter later.

### D3 — Route registration order: export before `:id`

`taskRouter` current order: `GET /` (line 23) → `GET /:id` (line 49) → `GET /:id/chat` → …. Hono matches registration order for overlapping patterns. `GET /api/tasks/export` **must** register between `GET /` and `GET /:id`, else `export` gets swallowed as an `:id` param. Concrete ordering constraint, not stylistic.

### D4 — Access control: query-param-driven (already the pattern)

`taskService.list(query, userId)` → `assertMembership(query.workspaceId, userId)`. `assertMembership` (apps/api/src/shared/lib/access.ts) takes the workspaceId string; it doesn't care whether it came from path or query. Export reuses the same call. No second access-check code path. Verified free.

## Solution

### Backend — `apps/api/src/modules/task/`

**Files**:

1. `task.service.ts` — add `exportTasks(query, userId)`:
   - `await assertMembership(query.workspaceId, userId)` (same as `list`).
   - Build `where: Prisma.TaskWhereInput` identically to `list` (extract a shared `buildTaskWhere(query)` helper to keep one filter path — both `list` and `exportTasks` call it).
   - `prisma.task.findMany({ where, include: { assignee: { select: { email: true } }, assignments: { include: { label: { select: { name: true } } } } }, orderBy: [{ position: 'asc' }, { id: 'asc' }] })` — one round-trip, all fields the CSV needs.
   - Return the row array; serializer is a separate function.

2. `task.routes.ts` — add `GET /export` **before** `GET /:id`:
   - `zValidator('query', exportTasksQuerySchema, ...)` guard.
   - `const auth = c.get('auth'); const rows = await taskService.exportTasks(query, auth.user.id);`
   - Build `ReadableStream` from async generator over `rows`: yield BOM + header row, then one CSV line per task.
   - `c.header('Content-Type', 'text/csv; charset=utf-8');`
   - `c.header('Content-Disposition', 'attachment; filename="tasks-{workspaceSlug}-{yyyyMMddHHmm}.csv"');` (workspaceSlug fetched via `prisma.workspace.findUnique` — one extra cheap query; fallback to workspaceId if missing).
   - `return c.body(stream);`

3. `task.service.ts` — add `csvEscapeField(s: string): string` (RFC 4180): wrap in `"..."` and double embedded `"` iff field contains `,` `"` `\r` `\n`. Returns the field as-is otherwise.

4. `task.service.ts` — add `serializeTaskCsvRow(task): string`:
   ```ts
   // Canonical source = TaskLabelAssignment join (schema.prisma:238).
   // labelsDeprecated is the F2 dual-write legacy array kept for migration
   // safety — do not read from it here; it can leak stale label names.
   const labels = task.assignments.map((a) => a.label.name).join(';');
   const fields = [
     task.status, // enum as-is
     task.title, // escaped
     task.assignee?.email ?? '', // empty when unassigned
     task.priority, // enum as-is
     task.dueDate ? task.dueDate.toISOString() : '', // explicit null guard, no coercion
     labels, // joined THEN escaped as one field
   ];
   return fields.map(csvEscapeField).join(',') + '\r\n';
   ```

### Shared — `packages/shared/src/task.ts`

Add `exportTasksQuerySchema = listTasksQuerySchema.omit({ cursor: true, limit: true })` + type export. (Lives in shared so the web client can type its export request params from the same schema.)

### Web — `apps/web/src/features/task/`

**Files**:

1. `api.ts` — add `exportTasksCsv(params): string` (triggers browser download via window.location or anchor+download). Simpler: build the URL with query string from current filter state, `window.location.href = url` — browser handles download + `Content-Disposition`. No fetch/Response parsing needed for a download.
2. `hooks.ts` — (none needed; export is a navigation, not a React Query mutation. If we want a loading state, add a thin `useExportTasksCsv` wrapper, but YAGNI for a download.)
3. `pages/list.tsx` — add "Export CSV" `<Button>` in the toolbar row, after `SavedViewsBar`, before/after the Board/List toggle. `onClick` reads the current filter state object already built for `SavedViewsBar`'s save path, calls `exportTasksCsv(params)`. Server-side filtered — exports the full filtered set, not the rendered page subset.

## Locked column set (6, ROADMAP-literal)

```
Status, Title, Assignee Email, Priority, Due Date, Labels
```

| Column         | Source                                   | Null/empty handling               | Format                                      |
| -------------- | ---------------------------------------- | --------------------------------- | ------------------------------------------- |
| Status         | `Task.status` enum                       | never null                        | enum as-is (`IN_PROGRESS` etc.)             |
| Title          | `Task.title`                             | never empty (Zod min on create)   | CSV-escaped                                 |
| Assignee Email | `Task.assignee.email`                    | `''` when `assigneeId` null       | email string                                |
| Priority       | `Task.priority` enum                     | never null                        | enum as-is (`HIGH` etc.)                    |
| Due Date       | `Task.dueDate`                           | `''` when null (explicit ternary) | ISO 8601 UTC                                |
| Labels         | `TaskLabelAssignment` → `TaskLabel.name` | `''` when none                    | `;`-joined, escaped as one field after join |

**Not included** (out of scope, P4-5's job): ID, Workspace, Created, Updated, Assignee Name, Description.

## CSV format

- RFC 4180.
- UTF-8 with BOM (`\uFEFF` first chunk) — Excel opens UTF-8 non-ASCII correctly.
- `\r\n` line endings (Excel-friendly).
- Header row: `Status,Title,Assignee Email,Priority,Due Date,Labels\r\n`.
- Empty result set: header row only.
- Escaping runs on the **joined** labels string (after `join(';')`), not per-label. Per-label quoting before join produces `"foo, bar";"baz"` which is invalid inside one RFC 4180 field.

## Streaming

- `findMany` once (one DB round-trip, all rows in memory).
- `ReadableStream` from async generator over the in-memory array: yield BOM+header chunk, then one CSV line per row.
- `c.body(stream)` — Hono supports `ReadableStream` natively on Node 18+.
- No await between chunks (source is synchronous memory; HTTP response backpressure handled by stream API).
- Memory profile: row array scales with workspace size; CSV buffer does not. Satisfies ROADMAP "no in-memory build for large workspaces" — the CSV string is never materialized whole.

True row-streaming via PG cursor rejected: requires raw SQL `DECLARE CURSOR`/`FETCH`, duplicating the filter `where` in raw SQL (two filter shapes — the drift risk D1 was about), and no workspace in P1-3's scope needs it. Belongs in P4-5.

## Web integration

- One "Export CSV" button in list page toolbar.
- Exports the current filter state — whether set manually OR loaded from a saved view (saved view's `query` is already loaded into the filter selects by `SavedViewsBar`; export reads the same state).
- Server-side filtered — matches what the backend list would return for the same params, not the rendered paginated subset.
- No "export all" / "export filtered" modal — "export all" = clear filters + export, already achievable.
- No per-row export button in `SavedViewsManager` (scope creep; load-then-export reuses one button).

## Error handling

- `workspaceId` missing/invalid → Zod 400 (via `zValidator`).
- Non-member → 400 `Not a member of this workspace` (via `assertMembership`, same as list).
- Empty result → 200, header row only, `Content-Disposition` still set.
- No dedicated rate limit — export is a GET (read path); broad 60/min write limit doesn't apply. Existing GET path has no rate limit. If abuse becomes a concern, add a dedicated export limit later (YAGNI now).

## Testing

**Integration (`apps/api/tests/integration/task-export.test.ts`)**:

- Export all tasks in Demo workspace → 200, `text/csv`, header + N rows, row count matches `findMany` count.
- Filter by `status=IN_REVIEW` → only IN_REVIEW rows.
- Filter by `priority=HIGH` → only HIGH rows.
- Filter by `assigneeId=<x>` → only x's tasks; unassigned excluded.
- Empty result (filter matches nothing) → header row only.
- Unassigned task → Assignee Email column is empty string.
- Null due date → Due Date column is empty string.
- Task with 2 labels → Labels column is `label1;label2`.
- Label name with comma (`foo, bar`) → Labels field quoted, comma preserved inside quotes.
- Title with comma + quote → RFC 4180 escaping (wrap, double quote).
- Non-member → 400.
- Missing `workspaceId` → 400.
- Cross-workspace filter (workspaceId=A, task in B) → no leak (filter is workspaceId-scoped).

**Web component (`apps/web/src/features/task/components/ExportCsvButton.test.tsx`)**:

- Renders button.
- Click builds correct URL with current filter params.
- Click triggers navigation/download (mock `window.location` or anchor click).

## Verification gates

- `pnpm --filter @flow-desk/shared build` → exit 0
- `pnpm --filter @flow-desk/api typecheck` → exit 0
- `pnpm --filter @flow-desk/api lint` → exit 0
- `pnpm --filter @flow-desk/api test:integration` → all pass (existing + new export tests)
- `pnpm --filter @flow-desk/web typecheck` → exit 0
- `pnpm --filter @flow-desk/web lint` → exit 0
- `pnpm --filter @flow-desk/web test -- --run` → all pass (existing + new button test)
- `pnpm --filter @flow-desk/web build` → exit 0
- `pnpm verify` → green
- Smoke: `curl 'http://localhost:3001/api/tasks/export?workspaceId=<demo>'` with auth cookie → 200, `text/csv`, header + 51 rows, opens in Excel/Numbers

## Acceptance seed (ROADMAP)

Export Demo workspace → CSV opens in Excel/Numbers with 51 task rows + correct headers.

## Files / LOC (rough)

- `packages/shared/src/task.ts` — +5 LOC (export schema + type)
- `apps/api/src/modules/task/task.service.ts` — +60 LOC (`buildTaskWhere` extract + `exportTasks` + `csvEscapeField` + `serializeTaskCsvRow`)
- `apps/api/src/modules/task/task.routes.ts` — +25 LOC (`GET /export` handler + stream)
- `apps/api/tests/integration/task-export.test.ts` — +120 LOC (13 integration tests)
- `apps/web/src/features/task/api.ts` — +15 LOC (`exportTasksCsv`)
- `apps/web/src/pages/list.tsx` — +10 LOC (button + onClick)
- `apps/web/src/features/task/components/ExportCsvButton.test.tsx` — +40 LOC (2 tests)

Total ~275 LOC + test infra.

## Out of scope

- PDF / Excel export (P4-5).
- Export-all vs export-filtered modal.
- Per-saved-view export button in SavedViewsManager.
- True PG cursor row-streaming (P4-5).
- Dedicated export rate limit.
- Export from board page (list page only per ROADMAP).

## Schema-hygiene checklist (AGENTS.md §Future-Sprint)

- [x] No `board` in names — `exportTasks`, `exportTasksQuerySchema`, `GET /api/tasks/export`.
- [x] Structural fields stay minimal — touches no Task fields, read-only.
- [x] Filter by parameter, not hardcoded scope — query-param `workspaceId`, reuses `listTasks` filter.
- [x] Migration stays additive — no schema change at all (read-only feature).
- [x] Epic/Sprint/Board deferred — no new models.
