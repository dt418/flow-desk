# Progress Log

### Session — ROADMAP completion goal (2026-07-11)

- **Goal**: Finish all non-cut ROADMAP items (P1-4…P4-6)
- **Completed**:
  - P1-4 webhooks verified+fixed (date serialize, soft-delete, HMAC tests)
  - P1-5 TOTP 2FA (schema, routes, login challenge, backup codes, UI)
  - P2-1 automation rules engine (condition eval, assign/set-field actions, Rules tab)
  - P2-2 email mention + status-change templates + wiring
  - P2-3 Prometheus `/metrics` + optional Sentry hooks
  - P3-1 sprint+estimate+burndown
  - P3-2 templates/recurring + processDue
  - P3-3 calendar month/week/day + DnD reschedule UI
  - P4-1 Task.type EPIC/STORY hierarchy
  - P4-2 multi-board CRUD
  - P4-3 Slack/GitLab routes (501 without env secrets)
  - P4-4 API keys + `/api/v1` Bearer
  - P4-5 Excel multi-sheet + PDF-text export formats
  - P4-6 a11y helper primitives + tests
- **Verification**: API unit 137, integration 242, web 34; typecheck green; build green
- **Highest priority unfinished**: none (ROADMAP non-cut items complete; P4-7 cut)
- **Blockers**: P4-3 Slack/GitLab OAuth **blocked** — SLACK*\*/FLOWDESK_GITLAB*\* unset (env-failure captured); status routes ship, connect returns 501
- **Next**: none for ROADMAP product features; optional polish / real Sentry DSN / OAuth secrets

## Current Verified State

- **Repository root**: `/home/thanh/flow-desk`
- **Standard startup**: `./init.sh` then `docker compose up -d`
- **Standard verification**: `pnpm --filter @flow-desk/shared build` + curl API + `bash scripts/prisma-exec.sh <args>`
- **Highest priority unfinished**: P3-3 (Calendar View — spec written, plan pending)
- **Active branch**: `main` (F7 merged, F8 implemented)
- **Post-F8 fixes**: (a) dev startup race — `turbo.json` dev `dependsOn: [^build, ^db:generate]` + `tsup.config.ts` `clean: false`; (b) seed cleanup — added `deleteMany` for ChatMessage/ChatChannel/UserNotificationPreference/WorkspaceNotificationSetting/EmailJob; (c) force-exit timer regression — moved 10s `setTimeout` inside `shutdown()` function
- **Prisma**: 7.8.0 | **pnpm**: 11.8.0 | **Node**: 22-alpine
- **R-39 resolved**: E2E suite 3/3 passing
- **Current blocker**: none
- **Key risks**: R-24 (ai-001 latency UX) — only material risk remaining
- **Session 021 (kanban-sprint-1)**: 15 bugs, 6 root-cause clusters. RC1/RC2/RC4 fixed. RC3/RC5/RC6 deferred to Sprint 1.5
- **Session 023 (improve audit)**: 39 findings → 14 plans executed. Key fixes: email worker bugs, security hardening, perf improvements, tech debt reduced
- **Session 024 (test fixes)**: Fixed 7 broken unit tests + docker inspect error. 97/97 unit tests pass
- **Session 022 (kanban-sprint-1.5)**: RC3/RC5/RC6 fixed
- **Session 020 fixes**: R-09 mention cap, R-10 mobile drag, R-18 timezone
- **Resolved in F2**: R-33 (split-brain selects)
- **Resolved in F3-F6**: R-29, R-30, R-31, R-32, R-34
- **Resolved risks**: R-36, R-37, R-38, R-35
- **Resolved risks (session 014)**: docker build + Prisma 5→7 migration
- **Security note**: `LLM_API_KEY` (sk-80c6f26e1...) was exposed in chat. Recommend rotating.

### Session 029 — Chat "Message delivery timed out" fix

- **Date**: 2026-07-08
- **Symptom**: `/workspace/{wid}/chat` shows toast `Message delivery timed out` after every send
- **Root cause**: `useSendMessage` captured `/collab` socket ONCE on mount. `getSocket` cache replaces socket on stuck-reconnect. Stale reference → buffered/dropped `.emit()` → ack never fires → 5s timeout
- **Fix**:
  1. Exported `getSocket` from `lib/socket.ts`
  2. `useSendMessage.mutate` looks up `getNamespacedSocket('/collab')` per call, bails early if `!socket.connected`
  3. `socket.emit('message:send', …, ack)` → `socket.volatile.emit(…)` — disconnected socket drops packet instead of buffering ack-less message
- **Verification**:
  - Server-side ack roundtrip confirmed (`ack.ok=true` with `messageId`)
  - `pnpm --filter @flow-desk/web typecheck`: ✓
  - `pnpm --filter @flow-desk/web lint`: 0 warnings
  - HMR picked up live bundle cleanly

### Session 028 — `pnpm dev` one-command wrapper + docker cleanup

- **Date**: 2026-07-07
- **Goal**: One-command local dev
- **Completed**:
  - **`scripts/dev.sh`** (new): starts postgres + redis via docker, auto-detects port conflicts (5432/6379 in use → 5433/6380), rewrites `.env` URLs, runs install + build + db:generate + db:migrate-deploy + db:seed, then `pnpm -r --parallel --filter ... run dev`. Cleanup trap with `trap -` re-entry guard.
  - **`package.json`**: `dev` → `bash scripts/dev.sh`; added `dev:turbo` + `dev:reset`
  - **`docker-compose.yml`**: `x-common-env` YAML anchor dedups DATABASE_URL/REDIS_URL/JWT/LLM/log-level
  - **Dockerfiles**: dropped unused `deps` stage; consolidated `COPY` commands
  - **Docs**: rewrote "Local Dev" sections — `pnpm dev` now one recommended command
- **Debugging trail**:
  - `kill 0` re-entry in cleanup trap → infinite "Stopping..." spam → fixed with `trap - EXIT INT TERM`
  - Prisma ran in docker mode → `FLOW_DESK_DB_MODE=local` on all `db:*` calls
  - `db:migrate:deploy` typo → `db:migrate-deploy`
  - API crashed `ECONNREFUSED 127.0.0.1:6379` → added REDIS_URL rewrite alongside DATABASE_URL
  - `pnpm -r --parallel --filter "@a @b @c"` → no such package → separate `--filter` flags
- **Verification**:
  - `pnpm dev` → `curl http://localhost:3000/api/health` returns `{"status":"ok"}`
  - postgres + redis healthy on 5433/6380
  - `docker compose config --quiet` → exit 0
- **Verified state bump**: 35 features + F7 + E2E + kanban-sprint-1 + audit-002 all passing

## Session 029 — realtime chat refactor (Phase 0)

- **Date**: 2026-07-07
- **Goal**: Refactor chat realtime layer to production-ready
- **Completed**:
  - 14 CRIT, 26 HIGH, 14 MED, 30+ LOW findings
  - ADR-007-realtime-reliability.md
  - REALTIME-AUDIT.md
- **Next**: Execute Phase 1 task 1.1 via subagent

## Session 030 — Calendar View design brainstorming

- **Date**: 2026-07-08
- **Goal**: Design Calendar View (P3-3)
- **Completed**:
  - Full brainstorming: explored codebase, task routes, hooks, routing, big-calendar source
  - User decisions: Month+Week+Day views, Build from scratch, Integrate with Saved Views, Future-proof startDate/endDate interface
  - Design spec: `docs/superpowers/specs/2026-07-08-calendar-view-design.md`
  - Architecture: CalendarProvider, shared grid interface, TaskCard presentation-only, DraggableTaskCard wrapper
  - Key insight: calendar is a **view layer** — composes existing task infrastructure
  - `taskApi.list` method needs to be added
- **Next**: User reviews spec, then invoke writing-plans skill

## Session Log

### 2026-07-10 02:00 — `d76dbae` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-10

- `78872be` — (main)
- `faea8ca` — test: fix all failing tests (e2e 22/22, unit 135/135, integration 220/220) + FE notification UI
- `315581e` — docs: add calendar view spec and implementation plan
- `30895a1` — docs: add calendar view implementation plan
- `119c62a`, `eec736d` — docs: update progress log
- `d514d22` — docs: mark realtime-chat-refactor as passing
- `c560b4d` — docs: update progress log
- `8c1e8e0` — fix: remove debug console.error/debug from socket code
- `c859a03` — feat: socket token auth + auto-refresh + plan-feature skill setup
- `1ecb3c6`, `c3e8810` — chore: remove old SearchPalette, replaced by CommandPalette
- `952ffc9` — test: add CommandPalette tests and jsdom polyfills
- `aabcb74`, `1f6762d` — feat: switch SearchPalette to CommandPalette in app-shell
- `246c645` — feat: add CommandPalette component using shadcn Command
- `3514d23` — feat: add cmdk dependency and shadcn Command component

### 2026-07-05

- `41178df` — fix: labelsDeprecated→labels mapping, memoize board props, stabilize e2e tests
- `d36ee71` — fix: CI failures — activity test mocks, realtime e2e, guardrails audit level
- `860768e` — feat: guardrails, webhooks, saved-views fixes, CI repair
- `a7ad24e` — chore: progress log auto-update
- `a846d03` — docs: mark P1-1 + P1-2 as shipped in ROADMAP + add R-43/R-44
- `3f8a11b` — docs: sync TASKS, RISKS, CHANGELOG for P1-1 Global Search + P1-2 Saved Views
- `1a6a3e2` — chore: P1-2 smoke test evidence added to feature_list.json
- `43634d7` — chore: P1-2 lint fixes + feature tracking

### Session 026 — P1-1 Global Search

- **Date**: 2026-07-05
- **Completed**: tsvector GIN indexes on Task/Comment/Attachment; shared search schemas; search API (repo/service/routes); 8 integration tests; SearchPalette with Cmd+K + 200ms debounce + keyboard nav; 4 web component tests
- **Fixes**:
  - `search.repository.ts`: comma+JOIN precedence trap → `CROSS JOIN LATERAL`
  - `migration.sql`: hyphen/dot tokenizer issue → `regexp_replace` before `to_tsvector`
  - `tests/setup/db.ts`: `prisma db push` can't express `GENERATED ALWAYS AS ... STORED` → `prisma migrate reset --force`
- **Verification**: `pnpm verify` green; tsx smoke: `GET /api/search?q=auth` → 200 with 3 ranked hits

### Session 025

- **Date**: 2026-07-04
- **Bug**: "cannot create new workspace from workspace switcher"
- **Root cause**: `WorkspaceCreateDialog` only in `dashboard.tsx`, app-shell passed `navigate('/')` — never opened dialog
- **Fix**: Added dialog import to `app-shell.tsx`, state, render after `<Outlet/>`
- **Tests**: Unit 4 tests + E2E 38-line spec
- **Verification**: `pnpm -r typecheck` green; `pnpm test` 10/10 pass

### Session 021 — Kanban Sprint 1

- **Date**: 2026-07-02
- **RC1**: click bubbling → INTERACTIVE_SELECTOR + NoCardClick
- **RC2**: 80ms PointerSensor lag → `distance:8` no delay + TouchSensor `{delay:150, tolerance:8}`
- **RC4**: nested role=button → attributes on inner div + aria on article
- **Verification**: typecheck ✓, build ✓ (908KB JS / 93KB CSS), check:secrets ✓
- **Deferred**: RC3, RC5, RC6, list sync

### Session 022 — Kanban Sprint 1.5

- **Date**: 2026-07-02
- **RC3**: optimistic reorder race → `move-progress.ts` flag prevents `task:moved` invalidation during move
- **RC5**: same-position move → early-return when `fromColumnId === toColumnId && fromIndex === toIndex`
- **RC6**: DragOverlay flicker → `opacity-30` + `transition-opacity` instead of `invisible`
- **Verification**: typecheck ✓, build ✓, check:secrets ✓

### Session 016 — Chat, Notifications & Email backend

- **Date**: 2026-06-28
- **Worktree**: `f7-chat-email`
- **Completed**: 5 Prisma models, Zod schemas, email provider (nodemailer+resend), BullMQ queue, chat API, task-level chat, notification preferences, email worker Docker, integration tests
- **Verification**: vitest 80/80, integration 162/162, vite build 701 KB

### Session 018 — Workspace CRUD + Kanban Polish (F8)

- **Date**: 2026-07-01
- **P1**: `useCreateWorkspace` hook + `WorkspaceCreateDialog` (RHF + zod, name/slug/description/visibility)
- **P2**: Kanban polish — no-flicker drag, keyboard a11y, column header kebab (add task + rename)
- **Verification**: typecheck ✓, build ✓ (7.15s), integration 187/190

### Session 019 — Post-F8 follow-up fixes

- **Date**: 2026-07-01
- **Fix 1**: Dev startup race → `turbo.json` dev `dependsOn: ["^build", "^db:generate"]` + `tsup.config.ts` `clean: false`
- **Fix 2**: Seed cleanup → added `deleteMany` for F7 models before workspace deletion (P2003 FK fix)
- **Verification**: `pnpm dev` clean start; seed succeeds (15 users, 6 workspaces, 51 tasks, 120 notifications)

### Session 017 — E2E stack fix (R-39)

- **Date**: 2026-06-28
- **Root causes**: Prisma 7 ESM + CJS Playwright conflict
- **Fixes**: Added `"type":"module"` to `packages/db/` and `e2e/`; inlined seed helpers; fixed routes `/w/`→`/board/`; pointer-event drag sequence
- **E2E results**: 3/3 pass

### Session 015 — Kanban dnd-pointer-stop bug fix

- **Date**: 2026-06-27
- **Root cause**: `listeners` on entire KanbanCard outer div — drag swallowed kebab clicks
- **Fix**: Outer div → `setNodeRef` only; inner wrapper → `attributes` + custom `onPointerDown` that bails on `closest('[data-no-drag]')`. Kebab + label trigger → `data-no-drag`
- **E2E spec**: `board-card-actions.spec.ts`

### Session 014 — Prisma 5 → 7 migration + docker build fix

- **Date**: 2026-06-23
- **Root causes**: (1) `.dockerignore` `node_modules` didn't exclude nested; (2) pnpm v11 ignores `.npmrc` hoist settings
- **Fixes**: `**/node_modules`; `publicHoistPattern` in `pnpm-workspace.yaml`
- **Prisma 7 migration**: generator, config, adapter, imports, dockerfile, seed ESM bundle
- **Verification**: docker build ✓, seed ✓, integration 142/142 ✓

### Session 012 — F3-F6 Backend Hardening + Realtime Polish

- **Date**: 2026-06-23
- **Completed**: F3 (soft-delete), F4 (cursor pagination), F5 (service/repo + tests), F6 (presence + DragOverlay)
- **Notable F5 bug**: `topologicalSort` iterated `t.dependencies` instead of `t.blockers` → false-positive cycle detection
- **Verification**: integration 142/142 ✓, typecheck ✓, build ✓

### Session 011 — F2 Kanban Polish

- **Date**: 2026-06-23
- **Completed**: 9 sub-stories, 42/42 BE integration tests, web typecheck+build green
- **Reconciliation**: removed inline TaskCard (97 LOC) → imported from `@/features/task`; wired PresenceBar + EmptyBoardState

### Session 010

- **Date**: 2026-06-23
- **F1 (R-36)**: default-mode → `docker` so unset `FLOW_DESK_DB_MODE` auto-starts
- **F2 (R-37)**: validates `FLOW_DESK_DB_MODE` up front with case statement
- **F7 (R-38)**: hardcoded container name → dynamic `docker compose ps -q api`
- **F8 (R-38)**: `sh -c` word-split → `docker compose exec -T -w /app/apps/api api pnpm exec prisma "$@"`

### Session 010b

- **Date**: 2026-06-23
- **Fix (R-35)**: `ServerType` not assignable to `Server<Http1>` → `createSocketServer(server as HttpServer)` cast

### Session 009

- **Date**: 2026-06-22
- **Worktree**: `feat/f1-security`
- **Completed**: rate-limit middleware, LLMError, socket-events singleton, task/comment/notification realtime emits, membership assert, attachment IDOR fix, bcrypt cost 10, per-route rate limits, web realtime hooks
- **Verification**: 5/8 smoke points passed

### Session 008

- **Date**: 2026-06-22
- **P0 fix B1**: new task feature module (api/hooks/types/index + NewTaskModal)
- **P0 fix B2**: drag-drop position → `$transaction` splice-removes/inserts + position renumbering + optimistic-lock version + auto-set status=DONE
- **Verification**: smoke tests pass; subtask CRUD, dependency cycle rejection, @mention fan-out all pass

### Session 007/006

- **Date**: 2026-06-22
- **Completed**: LLM provider integration (stream:false fix), latency accepted, defense-in-depth pre-commit hook blocking `.env*` paths and secret patterns
- **Verification**: 3 suggest-assignee calls returned 200 with fallback:false

### Session 005

- **Date**: 2026-06-22
- **Completed**: workspace settings page — General/Members/Columns/DangerZone tabs, role-gating, RHF+zod forms, sonner toasts

### Session 004

- **Date**: 2026-06-21
- **Completed**: hand-rolled `@dnd-kit` Kanban (ReUI abandoned), dashboard rebuilt, forms rebuilt with RHF+zod, sonner toasts, EmptyState/Input/Label primitives

### Session 003

- **Date**: 2026-06-21
- **Completed**: verified all API endpoints via curl; 17/20 features passing; 2 blocked (Google OAuth, LLM key); 1 not_started (List view)

### Session 002

- **Date**: 2026-06-21
- **Completed**: split env files for prisma CLI; initial push to GitHub

### Session 001

- **Date**: 2026-06-21
- **Completed**: full monorepo bootstrap — React + Vite + Tailwind + Hono + Prisma + Docker + all modules

## Session 027 — P1-2 Saved Views/Filters

- **Date**: 2026-07-05
- **Task 1**: SavedFilter model + partial unique index; softDeleteExtension SOFT_DELETE_MODELS sync
- **Task 2-5**: shared schemas, repository, service, routes
- **Task 6**: 9 integration tests
- **Discovery**: pre-existing `packages/db/src/prisma-extension.ts` missing ChatChannel, ChatMessage, SavedFilter from SOFT_DELETE_MODELS → fixed in commit
- **Task 7-9**: web feature module, SavedViewsBar + SavedViewsManager, 5 component tests
- **Verification**: typecheck ✓, lint ✓, integration 207/207 ✓, web test 23/23 ✓, build ✓

## Session 028 — P1-3 CSV Export

- **Date**: 2026-07-05
- **D1**: route shape → `GET /api/tasks/export?workspaceId=…&<filters>` (query-param-scoped)
- **D2**: schema reuse → `listTasksQuerySchema.omit({cursor:true, limit:true})`
- **D3**: route registration order — `/export` MUST before `/:id`
- **Tasks 1-7**: backend service (buildTaskWhere helper + csvEscapeField), route (ReadableStream), 13 integration tests, web wiring (window.location.href), 3 web tests
- **Verification**: integration 220/220 ✓, web test 26/26 ✓, smoke ✓ (BOM, RFC 4180 escaping, null guards)

## Session 2026-07-09 — All test suites green (377/377)

- Fixed every failing test across unit, integration, e2e
- Built missing FE notification UI

**Test results**: e2e 22/22, web unit 27/27, api unit 108/108, api integration 220/220. `pnpm verify` clean.

**Root causes fixed**:

- Integration: Redis port mismatch → `import 'dotenv/config'`
- Integration: `assertMembership` threw `ForbiddenError` not `BadRequestError`
- E2E: socket.io-client v4.8.3 uses callback-style auth → fixed `lib/socket.ts`
- E2E: 5 `sendMessage` calls missing `workspaceId`
- E2E: socket.io server auth → cookie fallback
- E2E: 11× FK-cascade cleanup

**Realtime bugs**:

- `socket.volatile.emit` silently dropped messages → plain `socket.emit`
- Sender got `message:new` twice → `sendMessage` no longer broadcasts; handler emits `socket.to(room)`; REST emits `io.to(room)`
- Channels list refetched on every `message:new` → `setQueryData` update
- `useReadReceipts` useMemo cached empty array → removed useMemo
- Read receipts never broadcast → added server broadcast
- `autoMarkRead` + TypingIndicator not rendered → added `useAutoMarkRead` hook + mounted `<TypingIndicator />`
- `db` fixture `scope: 'worker'` → flakiness → reverted

**Infrastructure hardening**:

- `withValidation` wrapped in try/catch
- `unhandledRejection`/`uncaughtException` safety net
- `redis maxRetriesPerRequest: null`

**Skipped**: 2 e2e tests for pre-refactor WebSocket API (replaced by socket.io)
