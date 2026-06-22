# Session Handoff

## Verified Now

- What is currently working:
  - 22/22 features passing (`feature_list.json`); kanban-bugs-fix added (priority 22)
  - Stack up: `REDIS_PORT=16379 docker compose up -d` (host 6379 held by system Valkey)
  - Web bundle `index-Dk3H20JT.js` (568KB / 169KB gz) serving at http://localhost:5173/
  - API at http://localhost:3000/api; JWT in httpOnly cookie
  - Demo creds: `demo@flow-desk.app` / `demo1234`
- What verification actually ran:
  - `pnpm --filter @flow-desk/shared build` → green
  - `pnpm --filter @flow-desk/api typecheck` → No errors found
  - `pnpm --filter @flow-desk/web typecheck` → No errors found
  - `pnpm --filter @flow-desk/web build` → 568KB JS / 63KB CSS, 5.94s
  - `docker compose build api web` → both images Built
  - Smoke tests (cookie auth as demo):
    - POST /api/tasks → 201, position=21, version=0
    - POST /api/tasks/:id/move same-column reorder → 200, renumbered 0..N-1, version→1
    - POST /api/tasks/:id/move stale version=99 → 409 CONFLICT + current snapshot
    - POST /api/tasks/:id/move cross-column to Done → 200, status=DONE + completedAt set, version→2
    - Subtask CRUD, dep create + cycle-rejected, comment+@mention

## Changed This Session

- Code or behavior added:
  - **B2 fix**: POST /api/tasks/:id/move gains `$transaction` that splice-removes from source column, splice-inserts at target position, parks all affected rows to 1M+i, renumbers 0..N-1 in both columns; optimistic-lock rejects stale `version` with 409 + current snapshot; auto-sets status=DONE + completedAt when target is done column
  - **B1 fix**: New `apps/web/src/features/task/` module (api/hooks/types/index + NewTaskModal) wired to "New task" button on /board; rhform+zod, useCreateTask mutation with React Query invalidation
  - Board page: snapshotRef rollback pattern on move failure, `position` + `version` now sent on drop
- Infrastructure or harness changes:
  - Worktree `.worktrees/kanban-bugs-fix` (branch `feat/kanban-bugs-fix`) — isolation workspace for the fix; main worktree unchanged until merge

## Broken Or Unverified

- Known defect:
  - **Socket.IO has zero emissions** — rooms joined but no `io.to().emit()` anywhere → clients do not see realtime updates after REST mutations. Confirmed by `grep io.emit|io.to|socket.emit` returning 0 matches in `apps/api/src`. Architecture promised, not wired.
  - **No rate limiting anywhere** — `RateLimitError` class exists but never instantiated. Auth brute-forceable; AI cost-amplifiable.
  - **Attachment IDOR** — `GET /api/attachments/:id/download` has no membership check; any authed user can stream any file.
  - **Membership missing on AI routes** (`/suggest-assignee`, `/auto-schedule`), `POST /comments`, `POST /attachments`.
  - **Soft-delete gaps**: `PATCH /workspaces/:id`, dependency endpoints, AI suggest-assignee task lookup, comment-task lookup, attachment upload.
- Unverified path:
  - 2-tab real-time board sync (no socket emissions → impossible until Socket.IO bug fixed)
  - Auth-002 Google OAuth — blocked on real GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI
- Risk for the next session:
  - Picking next scope track (F1 P0 broken CTAs / F2 kanban polish / F3 task-detail / F4 Jira clones) without first deciding order; queue is documented in `claude-progress.md` session 008

## Next Best Step

- Highest-priority unfinished feature:
  - None pending in `feature_list.json` (22/22 passing). Decision pending for the next scope track from session 008 brainstorm queue.
- Why it is next:
  - User pivoted to bug-hunt + UX polish after explicit "hoàn thiện tính năng + fix bug + tăng UI/UX clone Jira". Recommended track: **F1 P0 broken CTAs + workspace/task creation flow** (closes the largest visible gap — dashboard "New workspace" / board "New task" no-ops). Track F2 (kanban polish — SortableContext, live-shift animation, snapshot overlay) and F3 (task-detail page + edit/delete) queue behind it. F4 (Jira clones — command palette, mentions autocomplete, bulk select) is the largest.
- What counts as passing:
  - F1: All four broken CTAs wired + working modals (New Workspace, New Task, Task Detail) with form validation, server persistence, sonner feedback, React Query invalidation, optimistic where appropriate. `feature_list.json` entry moved to passing with evidence.
- What must not change during that step:
  - Architecture standards (routes/service/repository split is a follow-up refactor, not in F1 scope)
  - Pre-commit secret-hook
  - Prisma schema (additive only; soft-delete consistency fixes queue separately)

## Commands

- Startup: `REDIS_PORT=16379 docker compose up -d` (override host port 6379 conflict with system Valkey)
- Verification: `pnpm --filter @flow-desk/shared build && pnpm --filter @flow-desk/api typecheck && pnpm --filter @flow-desk/web typecheck && pnpm --filter @flow-desk/web build`
- Smoke: `curl -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"demo@flow-desk.app","password":"demo1234"}' -c /tmp/cookies.txt`
- Focused debug: `docker compose logs -f api` for requestId-tracked logs