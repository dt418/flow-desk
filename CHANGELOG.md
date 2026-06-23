# Changelog

All notable changes to FlowDesk.

## [Unreleased] — Sessions 011 + 012

### Added (Session 011 — F2 Kanban Polish)

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