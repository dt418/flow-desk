# Changelog

All notable changes to FlowDesk.

## [Unreleased] — Sessions 011 + 012 + 013

### Session 013 (this commit)

#### Fixed — realtime crash

- `apps/web/src/lib/socket.ts`: socket client now reads `access_token` cookie and passes it in `auth.token` + `extraHeaders.Cookie`. Without this, the JWT middleware on the BE side had no token to verify and could let an unauth'd connection through.
- `apps/api/src/modules/realtime/realtime.gateway.ts`: presence handler now rejects connections with no `userId` (logger.warn + emit `unauthorized` + `socket.disconnect(true)`) instead of throwing `TypeError: Cannot read properties of undefined (reading 'slice')` and crashing the api container.

#### Changed — seed (realistic data)

- `prisma/seed.ts` expanded from 5 users / 2 workspaces / 24 tasks to **15 users / 6 workspaces / 51 tasks / 60 subtasks / 14 deps / 199 comments / 120 notifications / 16 attachments / 26 labels**.
- Mixes OWNER / ADMIN / MEMBER / GUEST roles across workspaces. Uses the new `TaskLabelAssignment` join table from F2 + dual-writes `Task.labelsDeprecated` for backward compat with F1 FE clients. Realistic status mix (BACKLOG / TODO / IN_PROGRESS / IN_REVIEW / DONE / BLOCKED) with overdue / today / soon / future due dates.
- Fixed enum mismatches caught on first run: `VIEWER` → `GUEST`; `MENTION`/`DUE_SOON` → `TASK_MENTIONED`/`TASK_DUE_SOON`; `uploaderId`/`sizeBytes` → `uploadedById`/`size`; added required `Attachment.type`.
- Removed `startedAt` field (not in current Task schema).

#### Verified

- `docker compose up -d --build api web` — api healthy, no crashes
- `curl /api/health` → 200
- `POST /api/auth/login demo@flow-desk.app` → 200, returns user
- `GET /api/workspaces` (paginated) → returns 1 page with `nextCursor`
- Web at :5173 → 200 (static served by nginx)
- All 6 workspaces visible to demo user

### Session 012 — F3-F6 Backend Hardening + Realtime Polish

- **Label module (BE)**: `apps/api/src/modules/label/` — Zod schema, repo, service (with `clearWorkspaceLabelsCache`), Redis cache (60s TTL), Hono routes; 6 sub-tasks + 9 integration tests.
- **Task-label assignment (BE)**: `TaskLabelAssignment` join table; service performs dual-write to `Task.labelsDeprecated` (string array) for backward compat with legacy FE clients; socket `task:labels-changed` broadcast on assign/unassign; 3 sub-tasks + 7 tests.
- **Workspace module refactor (BE)**: `apps/api/src/modules/workspace/{workspace.repository,workspace.service,member.service}.ts` extracted from inline routes; member invite + role-change endpoints with strict rate-limit; 2 sub-tasks + 18 tests.
- **Frontend foundation**: type-safe `api` client (with `ApiError` + Zod validation), TanStack Query provider, shadcn primitives (`dialog`, `dropdown-menu`, `popover`, `tooltip`), `useAuth` + `RequireAuth` route guard.
- **Workspace UI**: `WorkspaceSwitcher` in app header, settings page tabs (General/Members/Labels), member list with role badge + invite modal.
- **Label UI**: `LabelManagerPage` with create/edit/delete + named-color picker, `LabelChip` component (WCAG-AA contrast), task-card label select via Radix Popover with optimistic updates.
- **Welcome flow**: 3-step onboarding wizard + empty-board state.
- **Realtime polish**: socket reconnection with exponential backoff (1s→30s, randomization 0.5, timeout 20s), `useSocketStatus` hook.
- **Playwright E2E scaffold**: `playwright.config.ts` + `e2e/{fixtures,critical-path,realtime}.spec.ts`.

### Added (Session 012 — F3-F6 Backend Hardening + Realtime Polish)

- **R-29 closed (F3)**: `apps/api/src/shared/lib/prisma-extension.ts` — `softDeleteExtension` auto-injects `deletedAt: null` on `findFirst`/`findMany`/`count`/`aggregate`/`groupBy` for 6 soft-delete models (User, Workspace, Task, TaskLabel, TaskLabelAssignment, Comment). 12 mutation-path gaps audited+fixed across 6 modules. 15 new integration tests in `soft-delete.test.ts`. Test infra deadlock fixed via TRUNCATE→DELETE in tx with `session_replication_role=replica`.
- **R-30 closed (F4)**: `packages/shared/src/pagination.ts` — `CursorPaginationQuery`, `CursorPaginationEnvelope`, `encodeCursor`/`decodeCursor` (base64url). Standardized 7 list endpoints with `?cursor=X&limit=N` (1-100, default 20). 12 pagination tests. **Breaking change**: response envelopes changed from `{ workspaces }` → `{ data, nextCursor }`, etc.
- **R-31 + R-32 closed (F5)**: Service/repo/routes/schema split completed for `task/`, `comment/`, `notification/`, `attachment/`, `ai/` modules (label/task-label/workspace already done in F2). 73 new integration tests. **Bug fix**: `topologicalSort` in `ai.service.ts` was iterating `t.dependencies` instead of `t.blockers`, causing self-loops and false-positive cycle detection — now fixed.
- **R-34 closed (F6)**: `apps/api/src/modules/realtime/realtime.gateway.ts` — server-side presence gateway on `/tasks` namespace with Redis-backed store (`presence:{wid}` hash, 30s TTL, 10s sweeper), `presence:join`/`heartbeat`/`leave` handlers, `presence:update` broadcast on every change. Kanban `DragOverlay` now renders real `TaskCard` clone via new `renderOverlay` prop (wired in `pages/board.tsx`). PresenceBar `TODO(server)` resolved.

### Changed

- `apps/api/src/shared/lib/socket.ts` — socket auth middleware now async (loads user name + avatar from Prisma for presence payloads).
- `packages/shared/tsconfig.json` — added `"types": ["node"]` for `Buffer` in `pagination.ts`.
- `packages/shared/package.json` — deduped duplicate `"./pagination"` export entry; added `"./label"` export.
- `apps/web/src/components/ui/kanban.tsx` — added `renderOverlay?: (taskId) => ReactNode` prop.

### Verified

- `pnpm --filter @flow-desk/api test:integration` → 13 files, **142/142** tests pass
- `pnpm typecheck` → exit 0 (both apps)
- `pnpm --filter @flow-desk/web build` → exit 0

### Risk register updates

- **Resolved**: R-29 (soft-delete gaps), R-30 (pagination), R-31 (no service/repo layer), R-32 (zero tests), R-33 (split-brain selects), R-34 (DragOverlay UX)
- **Open**: R-24 (ai-001 LLM latency UX — provider is local proxy at 103.157.204.253:3001, ~18-27s/call)
- **Blocked**: auth-002 (Google OAuth — needs real credentials)

## Earlier sessions

See `claude-progress.md` and `git log --oneline` for sessions 001-010.

## P1-1: Global Search (Session 026)

### What changed

**Backend:**

- `packages/db/prisma/migrations/20260704182043_search_tsvector/migration.sql` — GENERATED ALWAYS AS ... STORED tsvector on Task (title+description), Comment (content), Attachment (filename) + GIN indexes; `regexp_replace` normalizes non-alphanumerics to spaces so `invoice-2026.xlsx` → `invoice 2026 xlsx`
- `packages/shared/src/search.ts` — searchQuerySchema, searchResultSchema, searchResponseSchema
- `apps/api/src/modules/search/{search.repository,search.service,search.routes,index}.ts` — raw SQL with CROSS JOIN LATERAL plainto_tsquery + WorkspaceMember membership join + deletedAt IS NULL filter
- `apps/api/src/app.ts` — `app.route('/api/search', searchRouter)`

**Frontend:**

- `apps/web/src/features/search/{api,hooks,types,schemas,index}.ts` — search API client + useSearch hook with 200ms debounce
- `apps/web/src/features/search/components/SearchPalette.tsx` — Cmd+K palette in AppShell

### Verified

- `pnpm --filter @flow-desk/api test:integration -- search` → 8/8 pass
- `pnpm --filter @flow-desk/web test -- --run` → 18/18 pass (incl. 4 SearchPalette tests)
- Host-side smoke: `q=auth` → 3 task hits, `q=documentation` → 2 task hits

## P1-2: Saved Views/Filters (Session 027)

### What changed

**Backend:**

- `packages/db/prisma/migrations/20260705085351_saved_filter/migration.sql` — SavedFilter model + partial unique index `WHERE deletedAt IS NULL`
- `packages/shared/src/saved-filter.ts` — savedFilterQuerySchema, savedFilterSchema, createSavedFilterSchema, updateSavedFilterSchema
- `apps/api/src/modules/saved-filter/{saved-filter.repository,saved-filter.service,saved-filter.routes,index}.ts` — CRUD at /api/workspaces/:wid/saved-filters with assertMembership guard
- `packages/db/src/prisma-extension.ts` — synced ChatChannel/ChatMessage/SavedFilter into SOFT_DELETE_MODELS (pre-existing drift fix)

**Frontend:**

- `apps/web/src/features/saved-filter/{api,hooks,types,schemas,index}.ts` — web feature module with useSavedFilters, useCreate/Update/Delete hooks
- `apps/web/src/features/saved-filter/components/SavedViewsBar.tsx` — list page toolbar: view selector + save dialog
- `apps/web/src/features/saved-filter/components/SavedViewsManager.tsx` — settings page: inline rename, toggle shared/private, delete with AlertDialog
- `apps/web/src/pages/list.tsx` — SavedViewsBar integrated into header bar
- `apps/web/src/pages/workspace-settings.tsx` — 'Saved views' tab added

### Verified

- `pnpm --filter @flow-desk/api test:integration -- saved-filter` → 9/9 pass
- `pnpm --filter @flow-desk/web test -- --run` → 23/23 pass (incl. 5 saved-filter tests)
- Host-side smoke: list empty, create full SavedFilter, re-list shows it, delete returns ok:true

### Bug fixed

**R-43: softDeleteExtension drift** — packages/db/src/prisma-extension.ts was missing ChatChannel/ChatMessage/SavedFilter. Module prisma did not soft-delete-filter these models. Fixed by syncing the db copy to match the apps/api copy (commit 12c6f6f).
