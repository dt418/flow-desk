# FlowDesk F2 — Workspace Creation, Switcher, Label CRUD, Onboarding

**Date:** 2026-06-23
**Session:** 011 (initial draft) → 012 (implementation drift recorded)
**Status:** Implemented — see drift note below

> **Implementation drift (recorded for honesty):**
>
> 1. **Label color type**: spec said free hex (`/^#[0-9a-fA-F]{6}$/`); actual is a named-color enum (8 values). UI uses Radix `RadioGroup` instead of color picker + hex input. `LabelChip` maps name → hex via `LABEL_COLOR_HEX` lookup.
> 2. **`Task.labelsDeprecated` storage**: spec said JSON array of `{name, color}`; actual is plain `String[]` (label names only). Dual-write in `task-label.service.ts` writes strings, not objects. Full deprecation (drop column) deferred per AGENTS.md additive-migrations rule.
>
> Shipped F2 source of truth: `feature_list.json` (entry `F2`) + `CHANGELOG.md`.
> **Track:** F2 (first of F2–F6 production polish)
> **Parent scope:** see `feature_list.json` → `scope-f2-f6`

## Problem

FlowDesk has 13 known production-readiness gaps identified during bug-hunt + feature audit:

| #   | Gap                                                                                       | Severity                      |
| --- | ----------------------------------------------------------------------------------------- | ----------------------------- |
| 1   | Dashboard hardcodes `workspaces[0]`; no UI to create a workspace                          | Blocker for new users         |
| 2   | No workspace switcher; impossible to leave current workspace                              | High                          |
| 3   | `TaskLabel` Prisma model exists but no API or UI to CRUD labels                           | High                          |
| 4   | `Task.labels: String[]` is a free-text tag bag; no validation, no list view, no filtering | Medium                        |
| 5   | No `/welcome` onboarding; new users see an empty board with no guidance                   | Medium                        |
| 6   | Workspace limit unstated; risk of unbounded growth                                        | Low                           |
| 7   | Label colors are ad-hoc strings; no palette                                               | Low                           |
| 8   | Cross-workspace label assignment not guarded against                                      | Medium (security)             |
| 9   | Role hierarchy not enforced on label write paths                                          | Medium (security)             |
| 10  | No optimistic UI on label assignment → janky UX on slow networks                          | Low                           |
| 11  | No realtime sync of label changes → stale boards                                          | Medium                        |
| 12  | Workspace creation has no rate limit → spam vector                                        | Low                           |
| 13  | Zero tests repo-wide → `pnpm test` is a vacuous echo                                      | Critical (R-32 carry-forward) |

F2 closes 1–12 and lays the test infrastructure for the rest of F3–F6. F2 is the first of 5 polish tracks (F2–F6) — it unblocks onboarding, the most visible gap, before deeper work.

## Goals

1. New user can sign up, land on `/welcome`, create a workspace, and reach a working board in ≤ 60 seconds.
2. Existing user can switch workspaces via top-bar dropdown OR sidebar list.
3. Labels are workspace-scoped, CRUD-able by OWNER/ADMIN, viewable by MEMBER/GUEST, with bounded count (100/workspace).
4. Labels are assigned to tasks via explicit `TaskLabelAssignment` M2M; `Task.labels: String[]` becomes deprecated and removed in phase 2.
5. Cross-workspace label assignment is impossible (server-enforced, transactional).
6. Label changes propagate via Socket.IO to all workspace members in < 2 s.
7. Test infrastructure (vitest unit/integration + Playwright E2E) is in place and `pnpm test` is no longer an echo.
8. Feature is shipped behind a single PR, with rollback plan documented.

## Non-Goals

- Workspace **invitation** flow (email/links) — deferred to F3 (F2 `/welcome` shows UI stub, backend logs warning).
- Workspace **archiving / soft-delete** UI — deferred to F3.
- Label **search across workspaces** — out of scope; labels are workspace-scoped only.
- **Drag-drop label reordering** — deferred to F6.
- **Bulk label operations** (apply to N tasks) — deferred to F6.
- **Label inheritance** from column templates — deferred.
- **Email notifications** on label changes — deferred.
- Architecture refactor (service/repository/schema split) — deferred to F4.
- **i18n** strings — copy remains English for F2; i18n extraction is F6.

## Locked Design Decisions (Q1–Q11)

| #   | Question                                | Decision                                                                         |
| --- | --------------------------------------- | -------------------------------------------------------------------------------- |
| Q1  | Scope of this round?                    | Full polish — 5 tracks (F2–F6)                                                   |
| Q2  | Which track first?                      | F2 = create + switcher + TaskLabel CRUD + /welcome                               |
| Q3  | Keep `Task.labels:String[]` or replace? | **Replace** — drop column, use `TaskLabelAssignment`                             |
| Q4  | Onboarding placement?                   | Dedicated `/welcome` route, redirect from dashboard if `workspaces.length === 0` |
| Q5  | Switcher location?                      | Both — top-bar dropdown AND sidebar list                                         |
| Q6  | Default workspace visibility?           | PRIVATE                                                                          |
| Q7  | `/welcome` scope?                       | Full — workspace + invite stub + first board, all optional                       |
| Q8  | TaskLabel ↔ Task relation?              | Explicit `TaskLabelAssignment` M2M model                                         |
| Q9  | Migration strategy?                     | Additive 2-phase: phase 1 dual-write, phase 2 drop `Task.labels`                 |
| Q10 | Label create/edit/delete permission?    | OWNER/ADMIN only                                                                 |
| Q11 | Switcher scale?                         | Client-side search (cmdk) when >10 workspaces                                    |

---

## Part 1 — Workspace Creation UI

### `CreateWorkspaceDialog` component

**Location:** `apps/web/src/features/workspaces/components/CreateWorkspaceDialog.tsx`

**Triggered by:**

- "Create workspace" button on `dashboard.tsx` (top-right of empty state)
- "Create your first workspace" CTA on `/welcome` step 1

**Note:** Command palette (`Cmd+K`) integration is **out of scope** for F2 — deferred to F6 (command palette track).

**Schema (Zod, on client + mirrored server-side):**

```ts
const CreateWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(50),
  visibility: z.enum(['PRIVATE', 'PUBLIC']).default('PRIVATE'),
  description: z.string().trim().max(500).optional().default(''),
});
```

**Behavior:**

- Submit calls `POST /api/workspaces` (existing endpoint — needs visibility + description support, added in this PR)
- On success: invalidate `['workspaces']` query key, close dialog, navigate to `/{newWorkspace.slug}`
- On error: surface via `DomainError.code` mapped to friendly message table
- Per-user rate limit: 10 workspaces/day (enforced server-side, returns `WORKSPACE_LIMIT_REACHED`)

### Server changes (`apps/api/src/modules/workspace/`)

**`workspace.schema.ts`** — extend `CreateWorkspaceSchema` with `visibility` (default `PRIVATE`) and optional `description`.

**`workspace.service.ts`** — `create()`:

- Insert Workspace + WorkspaceMember(OWNER) in a single transaction
- Check user workspace count: if ≥ 10, throw `WorkspaceLimitReachedError`
- Generate slug from name (kebab-case, dedup with numeric suffix if collision)
- Emit Socket.IO `workspace:created` to user's personal room

### New errors

| Code                      | HTTP | Cause                                                             |
| ------------------------- | ---- | ----------------------------------------------------------------- |
| `WORKSPACE_LIMIT_REACHED` | 403  | User already owns 10 workspaces                                   |
| `WORKSPACE_NAME_TAKEN`    | 409  | Slug collision after 100 numeric retries (effectively impossible) |

---

## Part 2 — Workspace Switcher

### Components

**`WorkspaceSwitcherDropdown`** — `apps/web/src/features/workspaces/components/WorkspaceSwitcherDropdown.tsx`

- Top-bar trigger, shows current workspace name + avatar
- Opens cmdk command palette if `workspaces.length > 10`, otherwise simple list
- Keyboard nav: `↑/↓/Enter/Esc`, type-to-filter
- On select: navigate to `/{workspace.slug}`, invalidate non-global query caches

**`WorkspaceSidebar`** — `apps/web/src/features/workspaces/components/WorkspaceSidebar.tsx`

- Left sidebar on dashboard + board pages
- Shows all workspaces grouped: "Owned" / "Member of"
- "Create workspace" item at bottom

### Switcher scale logic (`useWorkspaceSwitcher.ts`)

```ts
const { view, setQuery, filtered } = useWorkspaceSwitcher(workspaces);
const view = workspaces.length > 10 ? 'cmdk' : 'list';
```

### Backend (no new endpoints)

`GET /api/workspaces/me` already exists (returns user's workspaces). Extend response shape:

```ts
{
  owned: Workspace[],
  memberOf: Workspace[],
  total: number
}
```

---

## Part 3 — TaskLabel CRUD (replaces `Task.labels: String[]`)

### Data model changes

**New model** (additive, phase 1):

```prisma
model TaskLabelAssignment {
  id          String   @id @default(cuid())
  taskId      String
  task        Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  labelId     String
  label       TaskLabel @relation(fields: [labelId], references: [id], onDelete: Cascade)
  assignedAt  DateTime @default(now())
  assignedBy  String
  assigner    User     @relation(fields: [assignedBy], references: [id])

  @@unique([taskId, labelId])
  @@index([taskId])
  @@index([labelId])
  @@index([assignedBy])
}
```

**Modify `Task`:**

```prisma
model Task {
  // ... existing fields ...
  labelsDeprecated String[]  @default([])  // renamed from `labels`, kept dual-written in phase 1
  labelAssignments TaskLabelAssignment[]
}
```

**Modify `TaskLabel`** — add back-relation:

```prisma
model TaskLabel {
  // ... existing fields ...
  assignments TaskLabelAssignment[]
}
```

### Phase 1 behavior (this PR)

- `task.service.ts` **`update()` rejects `labels` field** (legacy `String[]` dropped from input shape; client must use `PUT /tasks/:tid/labels`).
- `task.service.ts` `assignLabels(taskId, userId, labelIds)` new method:
  - Load task + column → `workspaceId`
  - Load all `labelIds` → assert each `label.workspaceId === workspaceId`
  - Validate **before** any writes; if any mismatch, throw `TASK_LABEL_CROSS_WORKSPACE` with no partial state possible
  - Replace `TaskLabelAssignment` rows for task in same Prisma transaction
  - **Dual-write side effect**: write `labelsDeprecated = labelAssignments.map(a => a.label.name)` so legacy readers see consistent view
- `task.service.ts` `getById()` returns `assignments: TaskLabelAssignment[]` with eager-loaded `label`.
- Backfill script `scripts/backfill-task-labels.ts` is **idempotent per task in a transaction**, supports `--dry-run`, exits 1 if >5% of tasks fail migration.

### Cache invalidation (`GET /api/workspaces/:wid/labels`)

- Redis key: `workspace:{wid}:labels`, TTL 60s
- **Invalidate** on `label:created`, `label:updated`, `label:deleted` (delete key, not write-through — simpler, no race)

### Phase 2 (deferred, ≥ 1 sprint after phase 1 ships to prod)

- Drop `Task.labelsDeprecated` column in additive migration.
- Remove dual-write from `task.service.ts`.

### New module — `apps/api/src/modules/label/`

```
label/
  label.routes.ts
  label.service.ts
  label.repository.ts
  label.schema.ts
  __tests__/
    label.schema.test.ts
    label.service.test.ts
    label.routes.test.ts
```

### Routes

| Method   | Path                                   | Scope          | Auth        |
| -------- | -------------------------------------- | -------------- | ----------- |
| `GET`    | `/api/workspaces/:wid/labels`          | `read:label`   | any member  |
| `POST`   | `/api/workspaces/:wid/labels`          | `write:label`  | OWNER/ADMIN |
| `PATCH`  | `/api/workspaces/:wid/labels/:labelId` | `write:label`  | OWNER/ADMIN |
| `DELETE` | `/api/workspaces/:wid/labels/:labelId` | `write:label`  | OWNER/ADMIN |
| `PUT`    | `/api/tasks/:tid/labels`               | `write:assign` | any member  |

### Zod schemas (`label.schema.ts`)

```ts
const LabelColor = z.enum(['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'gray']);

const LabelCreateSchema = z.object({
  name: z.string().trim().min(1).max(50),
  color: LabelColor,
});

const LabelUpdateSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  color: LabelColor.optional(),
});

const LabelAssignSchema = z.object({
  labelIds: z.array(z.string().cuid()).min(0).max(50),
});
```

### Service (`label.service.ts`)

**`create(workspaceId, userId, input)`**

- Assert user is OWNER/ADMIN of workspace
- If `count(workspaceId) >= 100`, throw `LabelLimitReachedError`
- Check name uniqueness within workspace (case-insensitive) → `LabelNameTakenError`
- Insert label, emit `label:created` to `workspace:{wid}` room
- Return label

**`update(workspaceId, labelId, userId, input)`**

- Assert OWNER/ADMIN
- Update fields, emit `label:updated`

**`delete(workspaceId, labelId, userId)`**

- Assert OWNER/ADMIN
- Delete in transaction with `TaskLabelAssignment` cascade
- Emit `label:deleted` with `{ labelId, affectedTaskIds }` so clients can clear local cache

**`assignToTask(taskId, userId, labelIds)`**

- Load task + column → `workspaceId`
- Load all `labelIds` → assert each `label.workspaceId === workspaceId`
- **Validate before write**: if any mismatch, throw `TASK_LABEL_CROSS_WORKSPACE` before any row is touched (no partial state possible)
- Replace `TaskLabelAssignment` rows for task in same transaction
- Dual-write: set `Task.labelsDeprecated = labels.map(l => l.name)` so legacy readers see consistent view
- Emit `task:labels-changed` to `workspace:{wid}` with `{ taskId, labelIds }`

### Cross-workspace safety

- Validation happens **inside the same Prisma transaction** as the writes.
- A single `select` loads all labels; mismatches throw before any insert.
- **No partial writes** — tx rolls back entirely on validation failure.
- Returns 400 (not 403) because the request is malformed (resource from another workspace).

### Rate limits

| Scope              | Limit  | Key    |
| ------------------ | ------ | ------ |
| `label:write`      | 30/min | userId |
| `label:assign`     | 60/min | userId |
| `workspace:create` | 10/day | userId |

### Optimistic UI

- `useAssignLabels(taskId)` — optimistic: replace local `TaskLabelAssignment[]`, rollback on error with toast
- `useUpdateLabel(workspaceId, labelId)` — optimistic: patch local label cache, rollback on error
- `useCreateWorkspace()` / `useDeleteLabel()` — **not** optimistic (full-page reload or explicit confirmation)

### Realtime events

| Event                 | Room              | Payload                        |
| --------------------- | ----------------- | ------------------------------ |
| `label:created`       | `workspace:{wid}` | `Label`                        |
| `label:updated`       | `workspace:{wid}` | `Label`                        |
| `label:deleted`       | `workspace:{wid}` | `{ labelId, affectedTaskIds }` |
| `task:labels-changed` | `workspace:{wid}` | `{ taskId, labelIds }`         |
| `workspace:created`   | `user:{userId}`   | `Workspace`                    |

### TanStack Query keys

```ts
['workspaces']                                          // all user workspaces
['workspaces', wid, 'labels']                           // workspace label list
['workspaces', wid, 'tasks', filters...]                // board tasks
['tasks', tid, 'labels']                                // task label assignments
```

### Frontend components (`apps/web/src/features/labels/`)

```
labels/
  api.ts                    # typed client
  hooks.ts                  # useWorkspaceLabels, useAssignLabels, useUpdateLabel, useDeleteLabel, useCreateLabel
  types.ts
  index.ts
  components/
    LabelChip.tsx           # colored pill, renders name + remove button (in pickers)
    LabelPicker.tsx         # multi-select, search, max 50 enforced
    LabelManagerDialog.tsx  # CRUD UI (OWNER/ADMIN see write actions)
    ColorPicker.tsx         # 8-swatch palette
```

**LabelPicker.tsx** — shown in task detail panel; if workspace labels exist, render selected chips + "Add label" button → opens dropdown of available labels grouped by color. Search filters in real time. Hard cap at 50 selections with disabled state + tooltip.

**LabelManagerDialog.tsx** — workspace settings tab. List view with inline edit. OWNER/ADMIN sees "New label" button + delete icon per row. MEMBER/GUEST sees read-only view.

---

## Part 4 — `/welcome` Onboarding

### Route

`apps/web/src/pages/welcome.tsx` — protected route, mounted in `router.tsx` as `/welcome`.

### Redirect logic

In `apps/web/src/features/workspaces/hooks.ts`:

```ts
useOnboardingGuard() → if (workspaces.length === 0 && pathname !== '/welcome') navigate('/welcome');
```

Mounted at `App` root so any authenticated route triggers the guard.

### 3-step wizard (all steps skippable)

**Step 1 — Workspace**

- Pre-filled with default name suggestion (e.g., `{user.name}'s workspace`)
- Visibility default: PRIVATE
- "Create workspace" button
- "Skip for now" link (only shown if user has another way in — but since workspaces.length===0 is the trigger, skip leaves them on /welcome indefinitely; consider auto-redirect to /workspaces/new)

**Step 2 — Invite teammates** (UI stub)

- Email input + "Send invite" button
- On submit: logs warning `"F3: invite backend not implemented, email=${email}"`
- Toast: "Invites coming soon — we'll let you know"

**Step 3 — Create your first board**

- Column names input (defaults: "To do", "In progress", "Done")
- "Create board" button → calls existing `POST /api/workspaces/:wid/columns` for each
- On success: navigate to `/{slug}`

### UI

- Single-page scroll with step indicators (radix or shadcn `Tabs`)
- Each step is a `<Card>` with title + description + actions
- "Skip" link in top-right of every step

---

## Part 5 — Testing & Verification

### Test pyramid

| Layer       | Tool                    | Scope                        | Goal                    | Runtime |
| ----------- | ----------------------- | ---------------------------- | ----------------------- | ------- |
| Unit        | vitest                  | Zod schemas, hooks, reducers | Edge cases + invariants | < 5 s   |
| Integration | vitest + Prisma test DB | service + routes (real DB)   | Cross-module, tx, RBAC  | < 30 s  |
| E2E         | Playwright              | Critical user flows          | Smoke + realtime        | < 2 min |

### Required infra (closes R-32 + RISK-F2-4)

- `vitest.config.ts` (root) + `apps/api/vitest.config.ts` + `apps/web/vitest.config.ts`
- `apps/web/vitest.setup.ts` — jsdom, `@testing-library/react`, MSW for API mocks
- Replace `pnpm test` echo placeholder → `vitest run`
- `pnpm test:integration` — spawn test Postgres via `scripts/prisma-exec.sh`, run vitest with `--testPathPattern integration`
- `pnpm test:e2e` — Playwright headless, 2 browser contexts
- CI gate: `pnpm typecheck && pnpm test && pnpm test:integration && pnpm test:e2e` blocks PR merge

### Unit tests

**Backend (`apps/api/src/modules/label/__tests__/`):**

- `label.schema.test.ts` — Zod validation (name trim 1–50, color enum, labelIds cuid[] max 50, visibility enum)

**Frontend (`apps/web/src/features/labels/__tests__/` + `pages/__tests__/`):**

- `LabelChip.test.tsx` — render variants, color contrast
- `LabelPicker.test.tsx` — search, multi-select, 50-cap enforcement, disabled state
- `LabelManagerDialog.test.tsx` — CRUD UI, role-gated buttons hidden for MEMBER/GUEST
- `useAssignLabels.test.ts` — optimistic add/remove, rollback on error, query key invalidation
- `useCreateWorkspace.test.ts` — mutation success/error/validation, workspace limit error mapped to friendly message
- `WorkspaceSwitcherDropdown.test.tsx` — render list view (≤10 ws), cmdk view (>10 ws), keyboard nav
- `welcome.test.tsx` — 3-step flow, skip links, validation per step, navigation after step 3
- `dashboard.test.tsx` — redirect to `/welcome` when `workspaces.length === 0`, render list otherwise

### Integration tests (real Postgres)

**`apps/api/src/modules/label/__tests__/label.service.test.ts`:**

- `create()` — workspace-scoped uniqueness (case-insensitive), 100/workspace limit, OWNER/MEMBER 200, GUEST 403
- `update()` — GUEST 403, OWNER/MEMBER 200, cross-workspace 400
- `delete()` — cascades removes `TaskLabelAssignment` rows in tx
- `assignToTask()` — cross-workspace check fails whole tx on first mismatch, max 50/task
- `assignToTask()` — partial state never observable (assert `count == expected` after rollback)

**`apps/api/src/modules/label/__tests__/label.routes.test.ts`:**

- HTTP layer, rate limit headers present, error JSON shape `{error: {code, message, details?}}`
- 429 returns `Retry-After` header
- 403 for GUEST on write paths

**`apps/api/src/modules/workspace/__tests__/create.test.ts` (extend existing):**

- 10-workspace limit throws `WorkspaceLimitReachedError`
- Slug generation + collision suffix

### E2E tests (`apps/web/e2e/`)

| Spec                          | Flow                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------- |
| `f2-workspace-create.spec.ts` | signup → /welcome → step 1 create workspace → step 3 create board → land on board                   |
| `f2-label-crud.spec.ts`       | OWNER create, MEMBER edit (denied), GUEST view-only, delete cascades to task                        |
| `f2-switcher.spec.ts`         | seed 11 workspaces, open switcher, type-search filter, select switches URL                          |
| `f2-realtime.spec.ts`         | 2 browser contexts (A, B) in same workspace; A creates label; B sees `label:created` < 2 s          |
| `f2-onboarding-guard.spec.ts` | new user → any private route → redirects to /welcome; after workspace created → no longer redirects |

### Verification checklist (Definition of Done — F2)

- [ ] All unit tests pass
- [ ] All integration tests pass with real Postgres
- [ ] All E2E tests pass — **not flaky in 3 consecutive runs**
- [ ] `pnpm typecheck && pnpm test && pnpm test:integration && pnpm test:e2e` all green
- [ ] `pnpm test` is no longer an echo placeholder (closes R-32)
- [ ] Coverage report uploaded as CI artifact; `label/` module coverage > 80%
- [ ] Lighthouse perf budget: LabelList renders < 16 ms at 100 labels
- [ ] No new `TODO`s without linked issue

### Performance gates

- `LabelList` (100 labels) initial render < 16 ms (60fps)
- `useAssignLabels` mutation p95 < 200 ms
- `GET /api/workspaces/:wid/labels` p95 < 80 ms (cacheable, Redis-cached with TTL 60 s)

### Security checklist

- `assertRole(path, workspaceId, userId, ['OWNER', 'ADMIN'])` on label write paths; GUEST returns 403 **without** DB hit (role check before workspace lookup)
- Cross-workspace label assignment returns 400 with `TASK_LABEL_CROSS_WORKSPACE`
- Rate limit returns 429 with `Retry-After` header
- XSS via label name blocked by React's default escaping (no `dangerouslySetInnerHTML` on label render)
- All endpoints require auth (existing `requireAuth` middleware covers)
- `pnpm check:secrets` passes (pre-commit hook)

---

## Migration Plan

### Phase 1 (this PR)

1. **Add** `TaskLabelAssignment` model + indexes (`@@unique([taskId, labelId])`, `@@index([taskId])`, `@@index([labelId])`)
2. **Rename** `Task.labels` → `Task.labelsDeprecated` via additive migration: `ALTER TABLE "Task" RENAME COLUMN labels TO labels_deprecated`. Prisma maps `labelsDeprecated String[] @default([])`. Data preserved.
3. **Add** `label/` module + routes
4. **Extend** `task.service.ts update()` to dual-write
5. **Run** `scripts/backfill-task-labels.ts` on staging; verify with `scripts/verify-f2-migration.ts`
6. **Deploy** to production; monitor `task:labels-changed` event volume

### Phase 2 (≥ 1 sprint after phase 1 ships)

7. **Drop** `Task.labelsDeprecated` column in additive migration (after verifying no readers consume it)
8. **Remove** dual-write from `task.service.ts`
9. **Remove** `scripts/backfill-task-labels.ts` (retain `scripts/verify-f2-migration.ts` for one more release)

### Backfill script (`scripts/backfill-task-labels.ts`)

- Idempotent — skips tasks that already have assignments
- Per-task transaction — failure isolated to single task
- `--dry-run` flag — no writes, exits with code 0/1
- Exit 1 if > 5% of tasks fail (suggests systemic issue, not edge cases)

### Verification script (`scripts/verify-f2-migration.ts`)

- Asserts: every task has matching `TaskLabelAssignment` rows for each entry in `labelsDeprecated`
- Asserts: no `TaskLabelAssignment` references a label from another workspace
- Asserts: no orphaned `TaskLabelAssignment` rows after `TaskLabel` deletion
- Run in CI as smoke check post-deploy

---

## Acceptance Criteria

11 AC traced to Q1–Q11, each testable:

| AC    | Source | Test                                                                                                                                              |
| ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1  | Q1     | Scope document `feature_list.json` lists exactly 5 tracks F2–F6, each with priority ≥ 30                                                          |
| AC-2  | Q2     | `CreateWorkspaceDialog`, `WorkspaceSwitcherDropdown`, `WorkspaceSidebar`, Label CRUD components, `/welcome` page all exist                        |
| AC-3  | Q3     | `prisma/schema.prisma` has no `Task.labels: String[]`; instead `Task.labelsDeprecated: String[]` + `Task.labelAssignments: TaskLabelAssignment[]` |
| AC-4  | Q4     | Visiting `/dashboard` while `workspaces.length === 0` redirects to `/welcome`; E2E spec `f2-onboarding-guard.spec.ts` passes                      |
| AC-5  | Q5     | `WorkspaceSwitcherDropdown` (top-bar) and `WorkspaceSidebar` (left rail) both render workspace list                                               |
| AC-6  | Q6     | `CreateWorkspaceSchema.visibility` defaults to `PRIVATE`; integration test asserts                                                                |
| AC-7  | Q7     | `/welcome` has 3 steps (workspace / invite stub / first board), each skippable; `welcome.test.tsx` covers                                         |
| AC-8  | Q8     | `TaskLabelAssignment` model exists with `@@unique([taskId, labelId])` and explicit `@relation`                                                    |
| AC-9  | Q9     | `scripts/backfill-task-labels.ts` exists, idempotent, `--dry-run` works; `scripts/verify-f2-migration.ts` exits 0 on staging                      |
| AC-10 | Q10    | `assertRole(['OWNER', 'ADMIN'])` on `POST/PATCH/DELETE /labels`; integration test asserts GUEST 403                                               |
| AC-11 | Q11    | `WorkspaceSwitcherDropdown` switches to cmdk view when `workspaces.length > 10`; `WorkspaceSwitcherDropdown.test.tsx` covers                      |

---

## Risks

| ID        | Risk                                           | Likelihood | Impact | Mitigation                                                                           |
| --------- | ---------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------ |
| R-32      | Zero tests in repo (vacuous `pnpm test` echo)  | —          | High   | Phase 1 of F2 ships vitest infra; coverage gate enforced                             |
| R-35      | typecheck typecast workaround                  | Low        | Low    | Already resolved in 010b; spec confirms no new casts needed                          |
| RISK-F2-1 | Invite backend deferred                        | Medium     | Low    | `/welcome` step 2 UI stub + log warning + F3 entry in `feature_list.json`            |
| RISK-F2-2 | Phase 2 column drop premature                  | Low        | Medium | Phase 2 gated ≥ 1 sprint after phase 1 prod; explicit `verify-f2-migration.ts` smoke |
| RISK-F2-3 | 100-label/workspace boundary untested at scale | Medium     | Low    | Integration test exercises 100-label insert + 101st rejected                         |
| RISK-F2-4 | vitest infra missing (blocks DoD)              | Low        | High   | First vertical slice of F2 = test infra (R-32 closure); DoD checklist gates PR       |
| RISK-F2-5 | Optimistic UI + realtime race → flicker        | Medium     | Low    | Realtime event triggers query refetch, not local patch; rollback path tested         |
| RISK-F2-6 | `TaskLabelAssignment` index cardinality        | Low        | Low    | Composite indexes on `(taskId)` and `(labelId)` already specified                    |

---

## Out of Scope (tracked F3–F6)

| Track | Scope (deferred from F2)                                                                       |
| ----- | ---------------------------------------------------------------------------------------------- |
| F3    | Workspace invitations (email, link), workspace archive, member roles UI                        |
| F4    | Service / repository / schema layer split; centralized audit log; pagination on board take     |
| F5    | Realtime comments, attachment upload, drag-drop order persistence, dependency BFS optimization |
| F6    | Bulk label operations, label templates, i18n extraction, accessibility audit (axe-core in CI)  |

---

## Open Questions

None — all Q1–Q11 locked from brainstorming session 012.
