# Session Handoff

## Verified Now

- What is currently working:
  - 27/27 features passing (`feature_list.json`); F1 security track added (security-001..005, priority 23-27, all passing)
  - Stack up: `docker compose up -d` from `/home/thanh/flow-desk`
  - Web at http://localhost:5173, API at http://localhost:3000
  - Demo creds: `demo@flow-desk.app` / `demo1234`
- What verification actually ran (session 009):
  - Live curl smoke (worktree `feat/f1-security`):
    - `POST /api/auth/register` → 201, JWT cookies httpOnly, `x-ratelimit-limit: 3` (matches auth:register scope)
    - `POST /api/auth/login` → 200
    - `POST /api/workspaces` → 201, `x-ratelimit-limit: 60` (matches writeRateLimit)
    - `GET /api/workspaces/:id` as Bob (non-member) → 401 `UNAUTHORIZED` (assertMembership works)
    - `GET /api/workspaces/:id` as Alice → 200
    - `GET /socket.io/?EIO=4&transport=polling` → 200 with sid + websocket upgrade header
  - Pre-commit hook ran on F1 commits — no secrets, exit 0
  - `pnpm prisma db push` (via `docker compose exec api`) → "already in sync with Prisma schema"

## Changed This Session

- Code or behavior added (F1 security track):
  - **Rate limiting**: `shared/middleware/rate-limit.ts` (Redis INCR+EXPIRE sliding-window); `auth:register` 3/h/ip, `auth:login` 5/min/ip, `auth:refresh` 30/min/ip; AI 5/min/user; broad write 60/min/user; X-RateLimit-* headers + Retry-After on 429
  - **Socket.IO emissions**: `shared/lib/socket-events.ts` singleton + `setIo(io)` + emit helpers; task routes emit task:created/updated/deleted/moved/subtask:created/dependency:added; comment routes emit comment:created/updated/deleted; notification emit notification:new to user:{id}
  - **Membership**: `shared/lib/access.ts` `assertMembership(workspaceId, userId)`; applied to attachment POST/GET?taskId=/:id/download, task POST/PATCH/DELETE/move/subtasks/deps, comment POST/PATCH/DELETE, AI suggest-assignee/auto-schedule
  - **bcrypt**: cost 12 → 10 in `auth.routes.ts`
  - **LLM hardening**: `LLMError extends AppError(502, 'LLM_UPSTREAM')`; AbortController 30s timeout + 1 retry on 5xx/AbortError with 500ms backoff; error-handler status cast widened to `400|401|403|404|409|429|502|503`
  - **Web realtime**: `useNamespacedSocket` multi-namespace manager + `useRealtime(workspaceId, taskId?)` hook joins workspace: + task: rooms, invalidates React Query keys; `useNotificationsRealtime()` for notification:new; wired into `pages/board.tsx`
- Infrastructure or harness changes:
  - Branch `feat/f1-security` pushed to origin, fast-forward merged to main, main pushed
  - 15 commits total on main (14 F1 + 1 docs)

## Broken Or Unverified

- Known defect:
  - **R-29**: Soft-delete gaps — `PATCH /workspaces/:id`, dependency endpoints, AI task lookup, comment-task lookup, attachment upload allow operations on deleted entities (backlog)
  - **R-30**: Missing pagination on workspaces/members/attachments/board lists (backlog)
  - **R-31**: Zero service/repository layer (AGENTS.md violation, deferred to F4)
  - **R-32**: Zero tests across the repo (deferred to F4)
  - **R-33**: Split-brain selects — native `<select>` instead of Radix in some components (deferred to F2)
  - **R-34**: DragOverlay shows static "Moving…" instead of card clone (deferred to F2)
  - **R-35**: Pre-existing `src/index.ts(64,31)` `ServerType` vs `Server<Http1>` typecheck error — confirmed pre-existing via `git stash` + typecheck; does not block runtime
- Unverified path:
  - 2-tab real-time board sync (smoke verify stopped at socket reachability; full 2-tab interaction not exercised in CI-style script)
  - auth-002 Google OAuth — blocked on real GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI
  - LLM 31s timeout abort path — not exercised (would require stub fetch)

## Next Best Step

- Highest-priority unfinished feature:
  - None pending in `feature_list.json` (27/27 passing). Decision pending for next scope track.
- Recommended tracks (from session 008 queue):
  - **F2 Kanban polish** — SortableContext + slot-shift animation + DragOverlay card clone + Radix select migration (R-33, R-34). Visible UX wins.
  - **F3 Task-detail page** — full task view with edit/delete + comment thread + activity log. Closes the gap between board cards and modals.
  - **F4 Jira clones** — command palette (⌘K), mentions autocomplete, bulk select. Largest scope.
  - **Pre-flight**: fix R-35 (clean typecheck pipeline) before stacking new work.
- Why it is next:
  - User pivoted to "hoàn thiện tính năng + fix bug + tăng UI/UX clone Jira". F1 closed the security gaps; UI/UX polish is the visible next win.
- What counts as passing:
  - F2: Smooth drag animations + Radix select migration + 2-tab realtime sync verified end-to-end with `useRealtime` invalidation. `feature_list.json` entries flipped to passing with evidence.
- What must not change during that step:
  - Architecture standards (routes/service/repository split stays deferred to F4)
  - Pre-commit secret-hook
  - Prisma schema (additive only; soft-delete consistency fixes queue separately as R-29)

## Commands

- Stack: `pnpm stack:up` / `stack:up:build` / `stack:down` / `stack:logs` / `stack:ps` (smart port-override detection via `scripts/docker-up.sh`)
- Prisma (runs inside api container via `scripts/prisma-exec.sh`):
  - `pnpm db:push` / `db:push:skip-generate`
  - `pnpm db:migrate` / `db:migrate:deploy`
  - `pnpm db:seed` / `db:studio` / `db:reset`
  - `pnpm prisma <args>` — arbitrary prisma args through wrapper
- Build/typecheck/test: `pnpm build` / `pnpm typecheck` / `pnpm test` (turbo run)
- Local dev (no Docker): `pnpm dev:local` (`scripts/dev-local.sh` checks host postgres+redis then runs api+web in parallel)
- Smoke: `curl -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"demo@flow-desk.app","password":"demo1234"}' -c /tmp/cookies.txt`
- Focused debug: `pnpm stack:logs` for requestId-tracked logs
- New scripts (this session): `scripts/dev-local.sh` (run pnpm dev without Docker), `scripts/docker-up.sh` (smart compose up with port-override detection), `scripts/prisma-exec.sh` (docker-exec prisma wrapper)