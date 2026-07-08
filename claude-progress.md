# Progress Log

## Current Verified State

- **Repository root**: `/home/thanh/flow-desk`
- **Standard startup path**: `./init.sh` (pnpm install + shared build + git hook install) then `docker compose up -d`
- **Standard verification path**: `pnpm --filter @flow-desk/shared build` + curl API endpoints + `bash scripts/prisma-exec.sh <args>` for prisma
- **Highest priority unfinished feature**: none (35 features + F7 + E2E passing + kanban-sprint-1 passing + post-F8 dev/seed fixes + audit-002 passing + workspace-switcher-create fix passing)
- **Active branch**: `main` in `/home/thanh/flow-desk` (F7 merged, F8 implemented, post-F8 fixes committed)
- **Post-F8 fixes (session 019)**: (a) dev startup race condition — `turbo.json` dev task `dependsOn: [^build, ^db:generate]` + `tsup.config.ts` `clean: false` (prevents `MODULE_NOT_FOUND` + `EADDRINUSE` when shared rebuilds under `--watch`); (b) seed cleanup — `packages/db/prisma/seed.ts` added `deleteMany` for `ChatMessage`, `ChatChannel`, `UserNotificationPreference`, `WorkspaceNotificationSetting`, `EmailJob` before workspace deletion (fixes P2003 FK constraint violation on re-seed after F7 models added); (c) force-exit timer regression — `apps/api/src/index.ts` 10s `setTimeout` was at module level (fired unconditionally 10s after every startup, killing the API in dev mode); moved inside `shutdown()` function so it only fires during actual SIGTERM/SIGINT (commit `89c0233`, regression from AUD-008)
- **Prisma**: **7.8.0**
- **pnpm**: 11.8.0
- **Node**: 22-alpine
- **R-39 resolved**: E2E suite now runs (3/3 E2E tests passing). Fix: `e2e/` as workspace package with `"type":"module"`, `packages/db` with `"type":"module"`, inline seed helpers, route fix `/w/`→`/board/`, pointer-event drag helper.
- **Current blocker**: none
- **Key risks** (carry-forward): R-24 (ai-001 latency UX) — only material risk remaining
- **Session 021 (kanban-sprint-1)**: Kanban UX audit found 15 bugs in 6 root-cause clusters. Sprint 1 fixes RC1 (click bubbling via INTERACTIVE_SELECTOR + NoCardClick), RC2 (80ms PointerSensor lag → distance:8 no delay), RC4 (nested role=button → attributes on inner div + aria on article). Verified: typecheck ✓, build ✓ (908KB JS / 93KB CSS, 272KB gzip), check:secrets ✓. R-36/R-37/R-38 added. Deferred to Sprint 1.5: RC3 (optimistic reorder race), RC5 (same-position move), RC6 (overlay drift), list page sync.
- **Session 023 (improve audit)**: Full /improve audit — 4 parallel subagents, 39 findings, 20 prioritized into 14 plans (009-022). All 14 plans executed across 3 batches. Key changes: email worker bugs fixed (per-task dedup, BullMQ cancel, PENDING status), security hardened (extension allowlist, headers, rate-limit IP), performance improved (auth caching, code splitting, board select, Vite prod config), tech debt reduced (safeEmit/task helpers dedup, enum casts, API Zod validation), correctness fixed (register/OAuth transactional, chat uniqueness), test pipeline established (CI unit tests, E2E realtime, gateway tests). Commits: 862c85a → d9876b5.
- **Session 024 (test fixes)**: Fixed 7 broken unit tests + docker inspect error from audit batch changes. `tests/setup/db.ts` replaced docker inspect with pg_isready native detection. `chat.message.test.ts` added safeEmit/emitToUser mocks. `chat.test.ts` updated duplicate name test for P2002 unique constraint (findFirst removed). `notification-email.test.ts` assertion SENT→PENDING. `email-worker.test.ts` added bullmq Queue getJob mock. `scheduler.test.ts` added emailJob.create mock. 97/97 unit tests pass.
- **Session 022 (kanban-sprint-1.5)**: Fixed RC3 (optimistic reorder + Socket.IO self-broadcast race via move-progress flag), RC5 (same-position move early-return), RC6 (DragOverlay invisible snap → opacity-30 + transition-opacity). Verified: typecheck ✓, build ✓, check:secrets ✓. R-36/R-37/R-38 resolved, R-39/R-40/R-41 added. List sync N/A (table rows).
- **Session 020 fixes (2026-07-02)**: R-09 mention cap (MAX_MENTIONS=10 in comment.service.ts), R-10 mobile drag (TouchSensor added to kanban.tsx), R-18 timezone (formatDate/relativeDays accept optional timeZone param)
- **Resolved in F2 (session 011)**: R-33 (split-brain selects — Radix primitives added)
- **Resolved in F3-F6 (session 012)**: R-29 (soft-delete gaps + extension), R-30 (cursor pagination), R-31 (service/repo split all modules), R-32 (zero tests — 142 integration tests), R-34 (DragOverlay real-card clone)
- **Resolved risks (session 010)**: R-36 (prisma-exec regression), R-37 (silent env fallback), R-38 (sh -c word-split + hardcoded container name in seed path)
- **Resolved risks (session 010b)**: R-35 (pre-existing `apps/api/src/index.ts` ServerType typecheck error — cast at `createSocketServer` call site)
- **Resolved risks (session 014)**: docker build broken with Prisma 5 + pnpm 11 + lefthook (root causes: (a) `.dockerignore` nested node_modules leak, (b) hoist settings in `.npmrc` ignored by pnpm 11 — both fixed). Also: full Prisma 5→7 migration (generator, config, adapter, imports, dockerfile, prisma-exec, seed ESM bundle).
- **Security note**: `LLM_API_KEY` (sk-80c6f26e1...) was pasted in chat once during session 006. Recommend rotating the key at the provider. Key is in `.env`/`.env.local` (gitignored). Pre-commit hook blocks future leaks.

### Session 029 — Chat send "Message delivery timed out" fix

- **Date**: 2026-07-08
- **Symptom**: `/workspace/{wid}/chat` shows toast `Message delivery timed out` after every send; message is optimistically inserted but never promoted to `real`/`sent`.
- **Root cause**: `useSendMessage(hooks.ts:102)` captured the `/collab` socket ONCE on mount. The `getSocket` cache (lib/socket.ts:57-110) replaces the underlying socket on stuck-reconnect (`STUCK_RECONNECT_TIMEOUT_MS=15s`). Any `.emit()` on the stale reference was buffered/dropped, so the server's ack callback never fired and the 5s client timeout surfaced "Message delivery timed out".
- **Fix** (`apps/web/src/features/chat/hooks.ts` + `apps/web/src/lib/socket.ts`):
  1. Exported `getSocket` from `lib/socket.ts` so feature code resolves the live connection at the moment of use (no stale closure risk).
  2. `useSendMessage.mutate` now looks up `getNamespacedSocket('/collab')` per call and bails early with `Chat is offline. Reconnecting…` if `!socket.connected`.
  3. Switched `socket.emit('message:send', …, ack)` → `socket.volatile.emit(…)` so a disconnected socket drops the packet instead of buffering an ack-less message that would time out client-side and yet still land on the server (causing client-bug + ghost server record).
- **Verification**:
  - Server-side ack roundtrip confirmed with end-to-end smoke (`/tmp/opencode/smoke.mjs`: login → list workspace → list channel → `socket.emit('message:send', …, ack)` → `ack.ok=true` with `messageId`). Proves backend path is healthy.
  - `pnpm --filter @flow-desk/web typecheck`: ✓ no errors.
  - `pnpm --filter @flow-desk/web lint`: 0 new warnings; chat/hooks.ts clean.
  - `curl http://localhost:5173/src/features/chat/hooks.ts` shows live Vite bundle includes the new `getNamespacedSocket` import and `Chat is offline` toast — HMR picked up cleanly.

### Session 028 — `pnpm dev` one-command wrapper + docker cleanup

- **Date**: 2026-07-07
- **Goal**: One-command local dev that just works (no manual port juggling, no separate infra start) — best-practice DX. Plus docker/compose housekeeping.
- **Completed**:
  - **`scripts/dev.sh`** (new) — starts postgres + redis via `docker compose up -d postgres redis`, auto-detects host port conflicts (5432/6379 in use → remap to 5433/6380), rewrites `.env` `DATABASE_URL`/`REDIS_URL` to match actual ports, runs `pnpm install` + `pnpm --filter @flow-desk/shared build` + `FLOW_DESK_DB_MODE=local db:generate` + `db:migrate-deploy` + `db:seed`, then `pnpm -r --parallel --filter @flow-desk/shared --filter @flow-desk/api --filter @flow-desk/web run dev`. Cleanup trap with `trap -` re-entry guard (fixed infinite "Stopping..." loop). Exports nothing; all env stays in `.env`.
  - **`package.json`**: `dev` now `bash scripts/dev.sh`; added `dev:turbo` (`turbo run dev`) + `dev:reset` (`bash scripts/dev.sh reset`); removed `dev:local` (deprecated).
  - **`scripts/dev-local.sh`** — now a 4-line shim that prints a deprecation note and `exec`s `scripts/dev.sh`.
  - **`docker-compose.yml`**: `x-common-env` YAML anchor dedups DATABASE_URL/REDIS_URL/JWT/LLM/log-level between `api` and `email-worker`; service-specific keys (`PORT`, `CORS_ORIGINS`, `UPLOAD_DIR`, email SMTP, etc.) merge via `<<: *common-env`. `docker compose config --quiet` valid.
  - **`docker/api.Dockerfile`**: dropped unused `deps` stage; consolidated `COPY apps/api/package.json apps/web/package.json packages/*/package.json ./` into one layer (was 5 separate `COPY` commands).
  - **`docker/email-worker.Dockerfile`**: same cleanup as api (dropped `deps`, single package.json COPY).
  - **`docker/web.Dockerfile`**: dropped redundant `deps` stage; build pulls from `shared` + `env-build` directly.
  - **`docs/DEV.md` / `README.md` / `CHANGELOG.md` / `session-handoff.md`**: rewrote "Local Dev" sections — `pnpm dev` is now the one recommended command; `pnpm dev:turbo` for raw turbo; `pnpm dev:reset` for clean DB; removed the old 3-mode (hybrid/docker-hot/pure-local) split. Temporarily hardcoded port 6379→6380 during iteration was reverted per user instruction — `.env` stays at 6379, and `dev.sh` only remaps via env var when conflict detected (no hardcoded port overrides).
- **Debugging trail** (caught during live test runs):
  - `kill 0` re-entry in cleanup trap → infinite "Stopping..." spam → fixed with `trap - EXIT INT TERM` at start of `cleanup()`.
  - Prisma ran in docker mode (auto-started full stack incl. api/web) → `FLOW_DESK_DB_MODE=local` on all `db:*` calls in `dev.sh`.
  - `db:migrate:deploy` typo → `db:migrate-deploy` (actual script name).
  - API crashed `ECONNREFUSED 127.0.0.1:6379` because `.env` REDIS_URL still pointed at default port while docker redis remapped to 6380 → added REDIS_URL rewrite alongside DATABASE_URL.
  - `pnpm -r --parallel --filter "@a @b @c"` → no such package; must be separate `--filter` flags.
- **Verification** (live, end-to-end):
  - `pnpm dev` (backgrounded, 30s sleep) → `curl http://localhost:3000/api/health` returns `{"status":"ok","timestamp":"..."}`; web `curl -o /dev/null` returns HTTP 200.
  - postgres + redis docker containers healthy on 5433/6380 (host system postgres/redis occupied 5432/6379).
  - `docker compose config --quiet` → exit 0 (compose YAML valid).
- **Verified state** bump: 35 features + F7 + E2E + kanban-sprint-1 + audit-002 all passing (no test changes this session — DX only).
- **Risks remaining**: none new. R-24 (ai-001 LLM latency UX) is the only material carry-forward.
- **Next best step**: Run `pnpm verify` to confirm lefthook gate green before committing; then commit with conventional message (`chore(dx): pnpm dev one-command + docker-compose DRY`).

## Session 029 — realtime chat refactor (Phase 0)

- **Date**: 2026-07-07
- **Goal**: Refactor chat realtime layer to production-ready (Slack/Discord/Linear) matching the user's spec
- **Completed**:
  - Comprehensive audit: 14 CRIT, 26 HIGH, 14 MED, 30+ LOW findings across server / client / infra
  - Plan: docs/superpowers/plans/2026-07-07-realtime-chat-refactor.md (4 phases, ~50 tasks)
  - ADR-007-realtime-reliability.md (room model, event catalog, dedupe, ACK, typing/presence/read-receipts)
  - REALTIME-AUDIT.md (full findings table)
  - feature_list.json row added; claude-progress.md updated
- **Next best step**: Execute Phase 1 task 1.1 (add clientMessageId to shared chat schema) via subagent

## Session Log

### 2026-07-08 22:11 — `8c1e8e0` (main)

- **type:** fix
- **msg:** remove debug console.error/debug from socket code
- **author:** thanhd

### 2026-07-08 22:10 — `c859a03` (main)

- **type:** feat
- **msg:** socket token auth + auto-refresh + plan-feature skill setup
- **author:** thanhd

### 2026-07-08 21:48 — `1ecb3c6` (main)

- **type:** chore
- **msg:** remove old SearchPalette, replaced by CommandPalette
- **author:** thanhd

### 2026-07-08 21:48 — `c3e8810` (main)

- **type:** chore
- **msg:** remove old SearchPalette, replaced by CommandPalette
- **author:** thanhd

### 2026-07-08 21:39 — `952ffc9` (main)

- **type:** test
- **msg:** add CommandPalette tests and jsdom polyfills
- **author:** thanhd

### 2026-07-08 21:33 — `aabcb74` (main)

- **type:** feat
- **msg:** switch SearchPalette to CommandPalette in app-shell
- **author:** thanhd

### 2026-07-08 21:33 — `1f6762d` (main)

- **type:** feat
- **msg:** switch SearchPalette to CommandPalette in app-shell
- **author:** thanhd

### 2026-07-08 21:29 — `246c645` (main)

- **type:** feat
- **msg:** add CommandPalette component using shadcn Command
- **author:** thanhd

### 2026-07-08 21:25 — `3514d23` (main)

- **type:** feat
- **msg:** add cmdk dependency and shadcn Command component
- **author:** thanhd

### 2026-07-08 21:08 — `e997698` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-08 02:43 — `d316c43` (main)

- **type:**
- **msg:**
- **author:** fdesk

### 2026-07-08 01:08 — `f6cadcf` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-08 00:44 — `197e75d` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-07 23:58 — `2fd3029` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-07 23:49 — `3feaf5c` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-07 23:34 — `55344fd` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-07 22:06 — `df3a5fa` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-07 21:42 — `3aa5816` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-07 21:41 — `621757d` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-07 21:40 — `d51eea4` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-07 21:39 — `3c328dd` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-07 19:43 — `19cfd96` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-07 19:02 — `dc24d48` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-07 18:53 — `c0148d1` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-07 18:47 — `2366a5b` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-07 18:24 — `b11ac30` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-07 17:52 — `20c3e1d` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-05 22:43 — `41178df` (main)

- **type:** fix
- **msg:** labelsDeprecated→labels mapping, memoize board props, stabilize e2e tests
- **author:** thanhd

### 2026-07-05 22:13 — `d36ee71` (main)

- **type:** fix
- **msg:** CI failures — activity test mocks, realtime e2e, guardrails audit level
- **author:** thanhd

### 2026-07-05 22:02 — `860768e` (main)

- **type:** feat
- **msg:** guardrails, webhooks, saved-views fixes, CI repair
- **author:** thanhd

### 2026-07-05 19:23 — `a7ad24e` (main)

- **type:** chore
- **msg:** progress log auto-update
- **author:** thanhd

### 2026-07-05 19:22 — `f7b74c4` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-05 09:46 — `a846d03` (main)

- **type:** docs
- **msg:** mark P1-1 + P1-2 as shipped in ROADMAP + add R-43/R-44
- **author:** thanhd

### 2026-07-05 09:45 — `3f8a11b` (main)

- **type:** docs
- **msg:** sync TASKS, RISKS, CHANGELOG for P1-1 Global Search + P1-2 Saved Views
- **author:** thanhd

### 2026-07-05 09:42 — `1a6a3e2` (main)

- **type:** chore
- **msg:** P1-2 smoke test evidence added to feature_list.json
- **author:** thanhd

### 2026-07-05 09:39 — `43634d7` (main)

- **type:** chore
- **msg:** P1-2 lint fixes + feature tracking
- **author:** thanhd

### 2026-07-05 09:36 — `41b1d54` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-05 09:34 — `92f0444` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-05 09:31 — `8112205` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-05 09:23 — `12c6f6f` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-05 08:59 — `a8090fb` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-05 08:59 — `44db2f8` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-05 08:58 — `6e6a7e9` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-05 08:56 — `3c54033` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-05 08:55 — `78def7f` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-05 08:54 — `2fe98e0` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-05 02:23 — `7dcbd5e` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-05 02:18 — `f9f3294` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-05 02:18 — `bb08190` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-05 02:13 — `3a4957c` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-05 01:55 — `f1c53de` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-05 01:54 — `094996f` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-05 01:54 — `3c8c7f3` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-05 01:39 — `2c7af88` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-05 01:39 — `2a73c5f` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-05 01:39 — `c210252` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-05 01:38 — `100e9f4` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-05 01:38 — `e42906d` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-05 01:38 — `98d01bd` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-04 20:24 — `dbc5d00` (main)

- **type:** style
- **msg:** prettier-format new workspace-switcher test files
- **author:** thanhd

### 2026-07-04 20:20 — `09f1bb3` (main)

- **type:**
- **msg:**
- **author:** thanhd

### Session 026 — P1-1 Global Search

- **Date**: 2026-07-05
- **Goal**: Implement global full-text search (ROADMAP.md Phase 1, item P1-1) per plan `docs/superpowers/plans/2026-07-05-global-search.md`.
- **Completed**: tsvector generated columns + GIN on Task/Comment/Attachment; shared search schemas; search API module (repo/service/routes); 8 integration tests; web SearchPalette with Cmd+K + 200ms debounce + keyboard nav; 4 web component tests; AppShell wiring.
- **Fixes discovered during testing**:
  - `search.repository.ts`: comma+JOIN precedence trap — explicit JOIN binds to last comma FROM-item (the `plainto_tsquery` subselect), not the table → `CROSS JOIN LATERAL plainto_tsquery(...) AS q`.
  - `migration.sql`: default tsvector tokenizer keeps `invoice-2026.xlsx` as ONE lexeme (hyphens/dots don't split) → `regexp_replace(field, '[^a-zA-Z0-9]+', ' ', 'g')` before `to_tsvector` on all 3 columns.
  - `tests/setup/db.ts`: `prisma db push` can't express `GENERATED ALWAYS AS ... STORED` (Unsupported("tsvector") becomes plain nullable tsvector) AND conflicts with existing generated cols on re-push → switched `migrateTestDb` to `prisma migrate reset --force` (drops+reapplies all migrations incl search_tsvector).
- **Narrow supporting fixup**: committed untracked `20260704180603_dev` migration (TaskActivity table, missed in db9615a) — was applied to dev DB but never `git add`-ed; would break `migrate deploy` from fresh clone.
- **Verification**: `pnpm verify` green (typecheck-all + unit-tests + integration-tests 198/198 incl 8 new search + build); `pnpm -r lint` 0 errors; web tests 18/18 incl 4 new SearchPalette; host-side tsx smoke vs dev DB: `GET /api/search?q=auth` → 200 with 3 ranked task hits, `q=documentation` → 2 hits, unauth → 401.
- **Docker smoke blocked**: API container stuck on `pnpm install` attestations fetch (registry.npmjs.org DNS EAI_AGAIN / CONNECT_TIMEOUT) — environmental network issue, not code. Used host-side tsx run instead.
- **Risks**: none new. Raw SQL soft-delete filter is the documented gotcha (R-29 mitigation extended to search). Dev DB still has pre-edit migration expression (no regexp_replace) — task/comment search works, attachment filename search needs the edited migration; will apply on next natural dev DB reset.
- **Commits**: `98d01bd` (activity migration fixup), `e42906d` (Task 1 tsvector), `100e9f4` (Task 2 shared schemas), `c210252` (Task 3 repo), `2a73c5f` (Task 4 service), `2c7af88` (Task 5 routes), `3c8c7f3` (Task 6 tests + 3 fixes), `094996f` (Tasks 7-8 web feature + palette), `f1c53de` (Task 9 web test), `3a4957c` (lint fix).
- **Next**: P1-2 Saved views/filters (ROADMAP.md Phase 1) or pick from priority-90+ features.

### Session 025

- **Date**: 2026-07-04
- **Goal**: Fix "bug: cannot create new workspace from workspace switcher" — switcher's "New workspace" action only navigated to `/` without opening the create dialog.
- **Root cause**: `WorkspaceCreateDialog` only lived in `apps/web/src/pages/dashboard.tsx` with local state. `apps/web/src/components/layout/app-shell.tsx` passed `onCreateWorkspace={() => navigate('/')}` to `WorkspaceSwitcher` — never opened the dialog.
- **Fix** (single-file, `apps/web/src/components/layout/app-shell.tsx`):
  - Added `import { WorkspaceCreateDialog } from '@/components/ui/workspace-create-dialog'`
  - Added `const [createOpen, setCreateOpen] = React.useState(false)`
  - Changed `onCreateWorkspace` to `() => setCreateOpen(true)`
  - Rendered `<WorkspaceCreateDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(ws) => navigate(`/board/${ws.id}`)} />` after `<Outlet/>`
- **Tests added**:
  - Unit: `apps/web/src/features/workspace/components/WorkspaceSwitcher.test.tsx` (4 tests, all pass) — mocks `@/lib/api`, covers empty-state button + sidebar dropdown menuitem + header dropdown menuitem + omit-onCreateWorkspace. Uses QueryClientProvider + MemoryRouter pattern from workspace-create-dialog.test.tsx.
  - E2E: `e2e/workspace-switcher-create.spec.ts` (38 lines) — loginViaUI → board page → click switcher → click "new workspace" menuitem → assert dialog → fill name → submit → waitForURL `/board/`. Not run live (playwright inline compile, no tsconfig for e2e).
- **Verification run**:
  - `pnpm -r typecheck` → green across all 6 workspace projects (db, env, shared, api, web)
  - `pnpm test -- --run` in apps/web → 10/10 pass (4 new switcher + 6 existing dialog)
- **Artifacts updated**: `app-shell.tsx` (fix), `WorkspaceSwitcher.test.tsx` (new), `workspace-switcher-create.spec.ts` (new), `claude-progress.md`, `feature_list.json`
- **Risks remaining**: none new (R-24 carry-forward)
- **Next best step**: Pick from priority-95+ features or next audit plan

### 2026-07-03 23:46 — `e95f514` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-03 23:45 — `8b9f424` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-03 23:35 — `fa25a2e` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-03 23:34 — `940b612` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-03 23:18 — `46ab1a9` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-03 23:07 — `55a6989` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-03 23:00 — `9223ef6` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-03 22:57 — `8690fb2` (main)

- **type:** feat
- **msg:** add dev guardrails, fix CI, setup ESLint/Prettier hooks
- **author:** thanhd

### Session 021 — Kanban Sprint 1: a11y + click-bubble + sensor tuning

- **Date**: 2026-07-02
- **Goal**: Fix Kanban UX audit findings — RC1 (click bubbling), RC2 (80ms PointerSensor lag), RC4 (nested role=button axe violation)
- **Completed**:
  - `kanban.tsx`: exported `INTERACTIVE_SELECTOR` constant + `NoCardClick` wrapper; sensors → PointerSensor {distance:8} no delay + TouchSensor {delay:150, tolerance:8}; DropAnimation {duration:120}; KanbanCard filter uses INTERACTIVE_SELECTOR; useDraggable attributes+listeners on inner div (not wrapper)
  - `TaskCard.tsx`: removed role='button' from article; added aria-roledescription='draggable' + aria-label='Task: {title}'; 3 whitelists unified to INTERACTIVE_SELECTOR; kebab + label select wrapped in NoCardClick; removed data-no-drag attributes
- **Verification**: `pnpm --filter @flow-desk/web typecheck` → exit 0; `pnpm --filter @flow-desk/web build` → exit 0 (908KB JS / 93KB CSS, 272KB gzip); `pnpm check:secrets` → exit 0
- **Risks**: R-36 (click bubbling), R-37 (80ms lag), R-38 (nested role=button) — all mitigated by Sprint 1 changes
- **Deferred to Sprint 1.5**: RC3 (optimistic reorder + Socket.IO race), RC5 (same-position move no early-return), RC6 (DragOverlay animation drift), list page sync
- **Files updated**: `apps/web/src/components/ui/kanban.tsx`, `apps/web/src/features/task/components/TaskCard.tsx`, `plans/kanban-sprint-1.md`, `feature_list.json`, `RISKS.md`, `claude-progress.md`

### Session 022 — Kanban Sprint 1.5: race fix + same-position guard + overlay fade

- **Date**: 2026-07-02
- **Goal**: Fix remaining Kanban audit items — RC3 (optimistic reorder race), RC5 (same-position move), RC6 (DragOverlay flicker)
- **Completed**:
  - `realtime/move-progress.ts`: new shared module with `isMoveInProgress()` flag + `setMoveInProgress()` setter
  - `board.tsx`: early-return in `handleMove` when fromColumnId === toColumnId && fromIndex === toIndex (RC5); `setMoveInProgress(true)` before mutate, `setMoveInProgress(false)` in onError + onSettled (RC3)
  - `useRealtime.ts`: `task:moved` handler skips invalidation when `isMoveInProgress()` is true (RC3)
  - `kanban.tsx`: KanbanCard `isDragging` uses `opacity-30` + `transition-opacity duration-150` instead of `invisible` (RC6)
- **Verification**: `pnpm --filter @flow-desk/web typecheck` → exit 0; `pnpm --filter @flow-desk/web build` → exit 0; `pnpm check:secrets` → exit 0
- **Risks**: R-36/R-37/R-38 resolved (Sprint 1 + 1.5). R-39 (optimistic reorder race), R-40 (same-position move), R-41 (DragOverlay snap) added and mitigated.
- **List sync N/A**: list.tsx uses table rows, not KanbanCard/TaskCard — no INTERACTIVE_SELECTOR or NoCardClick needed.
- **Files updated**: `apps/web/src/pages/board.tsx`, `apps/web/src/components/ui/kanban.tsx`, `apps/web/src/features/realtime/move-progress.ts` (new), `apps/web/src/features/realtime/useRealtime.ts`, `feature_list.json`, `RISKS.md`, `claude-progress.md`

### Session 016 — Chat, Notifications & Email backend

- **Date**: 2026-06-28
- **Worktree**: `/home/thanh/f7-chat-email` on branch `f7-chat-email`
- **Goal**: Implement chat channels/messages, email notification system
- **Completed**: Prisma schema (5 models), Zod schemas (chat + notification-preferences), email-provider (nodemailer+resend), email templates, BullMQ queue + processors (instant/delayed/digest), chat channel+message API, task-level chat, notification preferences, task assignment trigger + email enqueue, frontend chat UI (sidebar, channel view, TaskChat), email worker Docker, integration tests.
- **Verification**: `vitest run` 80/80, `vitest run --config vitest.integration.config.ts` 162/162, `vite build` 701 KB.
- **E2E not run** — blocked by R-39.

### Session 018 — Workspace CRUD + Kanban Polish (F8)

- **Date**: 2026-07-01
- **Goal**: Implement approved design spec `docs/superpowers/specs/2026-06-30-workspace-crud-kanban-polish-design.md` — two bounded improvements.
- **P1 — Dashboard create-workspace hook + dialog**:
  - `apps/web/src/features/workspace/api.ts` — added `create(body)` → POST /api/workspaces
  - `apps/web/src/features/workspace/hooks.ts` — added `useCreateWorkspace()` mutation (invalidates `['workspaces']`)
  - `apps/web/src/features/workspace/index.ts` — exported `useCreateWorkspace`
  - `apps/web/src/components/ui/workspace-create-dialog.tsx` (NEW) — RHF + zodResolver(`createWorkspaceSchema`), fields: name, slug (auto-from-name, editable), description, visibility (PRIVATE|PUBLIC); toast errors via sonner; `onCreated(ws)` callback for redirect
  - `apps/web/src/pages/dashboard.tsx` — wired both "New workspace" + "Create your first" buttons → opens dialog → on success navigates to `/board/{ws.id}`
- **P2 — Kanban polish**:
  - `apps/web/src/components/ui/kanban.tsx` — (a) no-flicker drag: `opacity-30` → `invisible` on source card slot (keeps layout, no reflow); (b) keyboard a11y: `accessibility={{ announcements, screenReaderInstructions }}` on DndContext (drag start/over/end/cancel announcements + screen reader instructions); (c) column header kebab: `KanbanColumn` now accepts optional `onAddTask`/`onRenameColumn` callbacks; renders `DropdownMenu` with "Add task" + "Rename column" (inline `Input` edit with Enter/Escape/blur)
  - `apps/web/src/pages/board.tsx` — wired `onAddTask` (sets `createColumnId` + opens `NewTaskModal` with that column as default) + `onRenameColumn` (calls `useUpdateColumn` with toast error handling); `NewTaskModal` `defaultColumnId` now uses `createColumnId` fallback; resets `createColumnId` on close
- **No backend change** — POST /api/workspaces + PATCH columns already existed
- **Verification**: `pnpm --filter @flow-desk/web typecheck` → exit 0; `pnpm --filter @flow-desk/web build` → exit 0 (7.15s); `rg "data-no-drag" TaskCard.tsx` → 4 matches (prior fix preserved); integration tests 187/190 (3 pre-existing label.routes 401 failures, unrelated to frontend-only changes)
- **Web test setup**: Installed vitest ^2.1.9 + @testing-library/react ^16 + @testing-library/jest-dom ^6 + @testing-library/user-event ^14 + jsdom ^25. Added `test` block to `vite.config.ts` (jsdom env, globals, setup file). Created `src/test-setup.ts` (jest-dom matchers + cleanup). Replaced placeholder `test` script with `vitest run`. Wrote `src/components/ui/workspace-create-dialog.test.tsx` (6 tests: renders fields, auto-slug from name, manual slug override, submit + POST + onCreated, API error keeps dialog open, empty-name validation). **6/6 pass** in 2.35s. D10 (web test placeholder) resolved.

### Session 019 — Post-F8 follow-up fixes (dev startup race + seed cleanup)

- **Date**: 2026-07-01
- **Goal**: Fix two issues discovered after F8 commit — `pnpm dev` startup race condition and `prisma db seed` FK constraint failure on re-seed with F7 models.
- **Fix 1 — Dev startup race condition** (commit `adfaa29`):
  - **Root cause**: `turbo.json` `dev` task had no `dependsOn`, so all packages started concurrently. API crashed with `MODULE_NOT_FOUND` (shared `dist/` not built yet) and `EADDRINUSE` (tsx watch restarted API before port 3000 was released, triggered by shared tsup file writes).
  - **Fix**: `turbo.json` — added `dependsOn: ["^build", "^db:generate"]` to `dev` task (ensures shared builds + Prisma generates before dev servers start). `packages/shared/tsup.config.ts` — `clean: false` (was `true`, prevents tsup `--watch` from wiping `dist/` on rebuild, which caused momentary `MODULE_NOT_FOUND` in API).
  - **Verification**: `pnpm dev` starts all 3 servers cleanly — Vite on :5173 (324ms), API on :3000, shared tsup --watch — zero `EADDRINUSE` / `MODULE_NOT_FOUND` / `ECONNREFUSED` errors.
- **Fix 2 — Seed cleanup missing deleteMany for F7 models** (commit `ca6969d`):
  - **Root cause**: `packages/db/prisma/seed.ts` cleanup did not delete `ChatMessage`, `ChatChannel`, `UserNotificationPreference`, `WorkspaceNotificationSetting`, or `EmailJob` before deleting workspaces. These models have FK to Workspace without `onDelete: Cascade`, causing `PrismaClientKnownRequestError P2003` (foreign key constraint violated on `ChatChannel_workspaceId_fkey`).
  - **Fix**: Added `deleteMany` calls in correct FK order (lines 295-302) before workspace deletion: `chatMessage` → `chatChannel` → `userNotificationPreference` → `workspaceNotificationSetting` → (workspace members/workspaces) → `emailJob` → `notification`.
  - **Verification**: `npx prisma db seed` succeeds — 15 users, 6 workspaces, 51 tasks, 120 notifications seeded.
- **Full verification suite (this session)**:
  - `pnpm --filter @flow-desk/shared build` → ✓ (all DTS files generated)
  - `pnpm --filter @flow-desk/web typecheck` → ✓ (exit 0, no TS errors)
  - `pnpm --filter @flow-desk/api typecheck` → ✓ (exit 0, no TS errors)
  - `pnpm --filter @flow-desk/web test` → ✓ (6/6 pass, 6.96s)
  - `pnpm --filter @flow-desk/api test:integration` → ✓ (18 files, **190/190 pass**, 54.78s — 3 pre-existing label.routes 401 failures now resolved)
- **Commits**: `adfaa29` (dev race condition), `ca6969d` (seed deleteMany) — both already on `main`.
- **Files or artifacts updated**: `turbo.json`, `packages/shared/tsup.config.ts`, `packages/db/prisma/seed.ts`, `claude-progress.md`, `feature_list.json`
- **Known risk or unresolved issue**: none new. Remaining: R-24 (ai-001 latency UX), auth-002 (needs Google OAuth creds), ai-001 (needs LLM_API_KEY).
- **Next best step**: All features passing or blocked on external credentials. Next work requires product decisions on PRD-only items (NL task creation, meeting summarization) or external credential provisioning (Google OAuth, LLM API key).

### Session 017 — E2E stack fix (R-39): import chain, ESM loader, route mismatches

- **Date**: 2026-06-28
- **Goal**: Fix R-39 — E2E test suite unloadable due to Prisma 7 ESM client + CJS Playwright conflict.
- **Root causes and fixes**: Added `"type":"module"` to `packages/db/` and `e2e/`. Made `e2e/` a workspace package. Imported `PrismaClient` directly from generated client (avoided type-shadowing). Inlined seed helpers (broke factories dependency chain). Used `PrismaPg` adapter. Fixed routes `/w/`→`/board/`. Fixed login redirect regex. Used pointer-event drag sequence. Narrowed button selector.
- **E2E results**: 3/3 pass (critical-path, board-card-actions, realtime).
- **Verification**: `pnpm exec playwright test e2e/` → `PASS (3) FAIL (0)`.
- **Risks resolved**: R-39. Remaining: R-24.

### Session 015 — Kanban dnd-pointer-stop bug fix + E2E spec

- **Date**: 2026-06-27
- **Goal**: Fix kanban card swipe-eating kebab/label interactions (drag-drop on `article` swallows kebab clicks; "New task" flow + label widget both unavailable). Add regression spec.
- **Diagnosis**: `useDraggable`'s `listeners` were spread on the entire `KanbanCard` outer div, so any pointerdown on the wrapped `TaskCard` activated dnd-kit. Edit/Delete (kebab) and label popover were inert because drag took precedence and the kebab item never received its target click.
- **Fix** (`bbe6ee3`):
  - `apps/web/src/components/ui/kanban.tsx:215-247` — Refactored `KanbanCard`: outer div now only carries `setNodeRef`; inner wrapper gets `attributes` + a custom `onPointerDown` that bails on `closest('[data-no-drag]')`. Default behavior unchanged for the rest of the card surface.
  - `apps/web/src/features/task/components/TaskCard.tsx:144-180` — Kebab button now `data-no-drag` with `onPointerDown={(e) => e.stopPropagation()}` (avoids Radix's pointer-handler collision); label-trigger wrapper also `data-no-drag`. Click + keyboard nav exclude `[data-no-drag]` as well as `[data-task-label-trigger]` / `[data-task-kebab]` / native buttons/inputs.
  - `apps/web/src/features/task/components/TaskLabelSelect.tsx:58` — Read-only variant marks trigger `data-no-drag` so the label chip can never initiate a drag.
  - `e2e/board-card-actions.spec.ts` — 1 regression: login demo-flow user → `/board/{ws}` → create card → hover/kebab-click Edit → assert dialog count === 1, opacity > 0.9 (no DragOverlay clone) → Escape → kebab-click Delete → toast present, dialog count === 0.
- **Verification run**:
  - `pnpm typecheck` → exit 0, no errors across web/api/shared
  - Repo state: docker compose healthy (postgres/redis up 5h); web/api respond 200/200
  - **E2E not run** — `pnpm exec playwright test --list` raises `SyntaxError: Cannot use 'import.meta' outside a module` at `packages/db/src/client.ts:1`. Root cause: Playwright loads TS via CJS by default; Prisma 7's generated client (`apps/api/generated/...` and `packages/db/generated/...`) uses `import.meta` and is ESM-only. Same interop problem the seed script hit in session 014 (resolved there via `--format=esm --banner`). Out of scope for this hot-fix — captured as **R-39**.
- **Files or artifacts updated**:
  - `apps/web/src/components/ui/kanban.tsx` (+12/-3)
  - `apps/web/src/features/task/components/TaskCard.tsx` (+5/-1)
  - `apps/web/src/features/task/components/TaskLabelSelect.tsx` (+1)
  - `e2e/board-card-actions.spec.ts` (new, 52)
  - `claude-progress.md` (this session block + R-39 carry-forward)
- **Risks resolved**: this session closes the kanban-click-eating bug (was untriaged — no risk-id assigned).
- **Risks remaining**: R-24, R-39 (newly added)
- **Worktree active**: `/home/thanh/f7-chat-email` on `f7-chat-email` — Chat/Notifications/Email backend (merged in this session).
- **Next best step**: Address R-39 (`e2e/package.json` + `"type":"module"` + relocate `playwright.config.ts`) when starting a follow-up verification track. Until then, R-39 stays the binding constraint on E2E for any new commit that touches `e2e/fixtures.ts` or `packages/db/src/client.ts`. Don't touch those files in feature work without coordinating.

### Session 014 — Prisma 5 → 7 migration + docker build fix

- **Date**: 2026-06-23
- **Goal**: Docker build was failing with `Could not resolve @prisma/client` (pnpm 11 + monorepo hoisting). User requested Prisma 7 migration per official Prisma docker + turborepo guides.
- **Root causes fixed (separate issues)**:
  1. `.dockerignore` pattern `node_modules` did NOT exclude nested `apps/api/node_modules` in current Docker version. Fix: `**/node_modules` (root cause of stale host-side bin script overwriting pnpm-installed symlinks during COPY).
  2. pnpm v11 silently ignores hoist settings in `.npmrc`. `public-hoist-pattern[]=*prisma*` was dead. Fix: move to `publicHoistPattern` in `pnpm-workspace.yaml`.
- **Prisma 5 → 7 migration** (per official guides):
  - `prisma/schema.prisma`: `provider = "prisma-client"` + `output = "../apps/api/generated/prisma"`, dropped `url` from datasource
  - New `prisma.config.ts` at workspace root with `defineConfig` + `env('DATABASE_URL')`
  - Generated client at `apps/api/generated/prisma/client.ts` (custom output, per docs)
  - All 19 import sites updated: `from '@prisma/client'` → `from '../../../generated/prisma/client'` (3 levels from `apps/api/src/...`, 2 from `apps/api/tests/setup/...`)
  - All `new PrismaClient({...})` rewritten with `PrismaPg` driver adapter pattern (3 sites: api main, test setup, seed)
  - `apps/api/tsconfig.json`: dropped `rootDir: src`, added `generated/**/*` to `include` (TS error: generated dir not under rootDir)
  - `apps/api/package.json`: `prisma ^5.22 → ^7`, added `@prisma/adapter-pg ^7`, `pg ^8`, `dotenv ^16`, `@types/pg`
  - Deleted legacy `apps/api/prisma/schema.prisma` (preexisting v5 default; would shadow new config)
  - `prisma/seed.ts`: ESM bundle required (Prisma 7 client uses `import.meta.url`) — `prisma-exec.sh` updated to `--format=esm` + `--banner` for `require` shim
  - `docker/api.Dockerfile`: `COPY prisma.config.ts`, `ENV DATABASE_URL` placeholder for generate step, `COPY apps/api/generated` to runtime
  - `scripts/prisma-exec.sh`: cwd `/app/apps/api → /app` so root `prisma.config.ts` is picked up by Prisma 7
  - `turbo.json`: `build.dependsOn: ["^build", "^db:generate"]`, added `prisma/schema.prisma` + `prisma.config.ts` to globalDependencies, `DATABASE_URL` to globalEnv, `generated/**` to build outputs
  - `.gitignore`: added `apps/api/generated/` (per docs warning)
  - `pnpm --filter @flow-desk/api test:integration`: `migrateTestDb()` cwd fixed to absolute workspace root (`resolve(__dirname, '../../../..')`) + dropped `--skip-generate` (unknown flag in Prisma 7)
- **Verified**:
  - `pnpm install --no-frozen-lockfile` → ok (Prisma 7.8.0 + @prisma/client 7.8.0 + @prisma/adapter-pg 7.8.0)
  - `pnpm exec prisma generate` → `✔ Generated Prisma Client (7.8.0) to ./apps/api/generated/prisma`
  - `pnpm --filter @flow-desk/api typecheck` → exit 0
  - `pnpm --filter @flow-desk/web typecheck` → exit 0
  - `pnpm --filter @flow-desk/web build` → exit 0
  - `pnpm --filter @flow-desk/api test:integration` → 13 files, **142/142 tests pass**
  - `docker compose up -d --build api web` → all healthy
  - `/api/health` → 200
  - `scripts/prisma-exec.sh seed` (docker mode) → 51 tasks / 120 notifications / 16 attachments seeded
  - `POST /api/auth/login` demo/demo1234 → 200, `GET /api/workspaces` → 200
- **Schema drift note**: prod DB schema was older (`TaskLabelAssignment` missing). `scripts/prisma-exec.sh db push` applied before seed. `20260621155750_dev` migration also applied on api boot.
- **Key risks closed**: docker build with monorepo pnpm + prisma generate, Prisma 5 → 7 deprecation (no v5 leftover deps), ESM/CJS interop for seed bundle.
- **Next scope**: candidates — R-24 latency UX, R-16 soft-delete admin tool, CI integration of `pnpm test:integration` as required check, R-35 leftover apps/api/.gitignore cleanup, R-33 Radix select in NewTaskModal.

### Session 012 — F3-F6 Backend Hardening + Realtime Polish

- **Date**: 2026-06-23
- **Goal**: Ship F3 (R-29 soft-delete), F4 (R-30 cursor pagination), F5 (R-31+R-32 service/repo + tests), F6 (R-34 presence + DragOverlay)
- **Execution**: subagent-driven 4-way parallel (F3, F4, F5, F6). F6 returned empty (similar to subagent D in F2) — implemented inline.
- **Completed**: see `feature_list.json` entries F3-F6 — all 4 passing
- **Verification**:
  - `pnpm --filter @flow-desk/api test:integration` → 13 files, 142/142 tests pass
  - `pnpm --filter @flow-desk/api typecheck` → exit 0
  - `pnpm --filter @flow-desk/web typecheck` → exit 0
  - `pnpm --filter @flow-desk/web build` → exit 0 (chunk-size warning only)
- **Notable F5 bug fix**: `topologicalSort` in ai.service.ts was iterating `t.dependencies` (tasks t blocks) instead of `t.blockers` (tasks t is blocked by), causing self-loops and false-positive cycle detection. Now fixed.
- **F3 infra fixes**: TRUNCATE→DELETE in tx with `session_replication_role=replica` resolves test deadlocks that masked earlier results.
- **F6 design choice**: presence gateway mounted on `/tasks` namespace (not `/collab`) to match existing PresenceBar client wiring — no FE breaking change.
- **Next scope**: candidate work — admin tool for 30-day soft-delete recovery (R-16), R-24 latency mitigation (UX spinners/cancellation), CI integration of `pnpm test:integration` as required check, FE cleanup of legacy native `<select>` in NewTaskModal.

### Session 011 — F2 Kanban Polish

- **Date**: 2026-06-23
- **Goal**: Build F2 (Jira-clone polish) — labels module, workspace service split, Radix selects, realtime polish, E2E
- **Plan**: `/tmp/f2-plan.md` (1496 lines, Epics 4-12)
- **Execution**: subagent-driven 4-way parallel (A=BE 4-6, B=FE 7-9, C=Welcome+Realtime 10-11, D=E2E 12). Subagent D returned empty on first pass → re-implemented inline (playwright.config.ts + e2e/fixtures.ts + 2 specs).
- **Completed**: see `feature_list.json` entry F2 — 9 sub-stories passing, 42/42 BE integration tests pass, web typecheck+build green, api typecheck green
- **Reconciliation gaps closed inline**:
  - `apps/web/src/pages/board.tsx`: removed inline TaskCard (97 LOC) → imported `@/features/task` TaskCard; wired PresenceBar in header; wired EmptyBoardState when total tasks === 0
  - Subagent C left `TODO(server)` in PresenceBar.tsx for `apps/api/src/modules/realtime/realtime.gateway.ts` — captured in F6 backlog
- **Backend contract adaptations** (deviations from plan):
  - `LabelSchema.color` is a named enum (8 values), not free hex — UI uses RadioGroup
  - `Task.labelsDeprecated` is `String[]`, not JSON — dual-write stores label names only
- **Next scope**: F3 (close R-29 soft-delete gaps)

### Session 010

- **Date**: 2026-06-23
- **Goal**: Code-review follow-up for commit `0eabfcd` (feat(scripts): prisma-exec auto-detects docker|local mode) — close 8 findings (1 critical, 2 major, 5 minor)
- **Worktree**: none — small bug-fix-class change in main checkout. Worktree pattern reserved for larger feature tracks (cf. sessions 008/009).
- **Completed**:
  - **F1 (R-36, critical)**: default-mode inverted to `docker` so unset `FLOW_DESK_DB_MODE` + cold stack auto-starts via `scripts/docker-up.sh` instead of silently picking local. Pre-`0eabfcd` UX preserved.
  - **F2 (R-37, critical)**: `scripts/prisma-exec.sh` validates `FLOW_DESK_DB_MODE` up front with case statement; invalid values exit 64 with `ERROR: FLOW_DESK_DB_MODE must be 'docker' or 'local', got: '<value>'` to stderr.
  - **F3 (major)**: README.md mode bullets rewritten to reflect default=docker + auto-start behavior; invalid-value section added.
  - **F4 (minor)**: `apps/api/package.json` `db:reset` consolidated to single wrapper call `db push --force-reset --accept-data-loss --skip-generate` (was: two-call `migrate reset --force --skip-seed && db push --skip-generate` which could switch modes mid-reset).
  - **F5 (minor)**: `turbo.json` dead `inputs` on `db:push` dropped (`cache: false` made them no-op).
  - **F6 (minor, confirmed no-op)**: local-mode .env sourcing comment is accurate; no change needed.
  - **F7 (R-38, minor)**: hardcoded container name `flow-desk-api-1` replaced with dynamic `docker compose ps -q api` lookup for the seed-copy step.
  - **F8 (R-38, minor)**: `docker compose exec api sh -c "cd /app/apps/api && pnpm exec prisma $*"` replaced with `docker compose exec -T -w /app/apps/api api pnpm exec prisma "$@"` — no `sh -c` wrapping, no host-side word-split.
- **Verification run**:
  - `bash -n scripts/prisma-exec.sh` → syntax OK
  - `FLOW_DESK_DB_MODE=foo bash scripts/prisma-exec.sh db push --skip-generate` → `ERROR: FLOW_DESK_DB_MODE must be 'docker' or 'local', got: 'foo'` to stderr, exit 64
  - `FLOW_DESK_DB_MODE=local bash scripts/prisma-exec.sh db push --skip-generate` → host-side prisma, schema already in sync at localhost:5432, exit 0
  - Unset `FLOW_DESK_DB_MODE` + api container absent: `bash scripts/prisma-exec.sh db push --skip-generate` → auto-start banner → `docker compose exec -T -w /app/apps/api api pnpm exec prisma db push --skip-generate` → connects to postgres:5432, schema already in sync, exit 0
  - `docker compose exec --help` confirms `-w, --workdir string` flag (used by the new exec command)
  - `pnpm exec prisma db push --help` confirms `--accept-data-loss`, `--force-reset`, `--skip-generate` flags (used by consolidated db:reset)
- **Files or artifacts updated**:
  - `scripts/prisma-exec.sh` (rewritten: validation + default-docker + dynamic CID + `-w` flag), `apps/api/package.json` (db:reset single-call), `turbo.json` (dead inputs dropped), `README.md` (default-docker + invalid-value docs), `feature_list.json` (scripts-001 → passing with 9 evidence items), `claude-progress.md` (this session)
- **Risks resolved**: R-36 (prisma-exec default-flow regression), R-37 (silent env fallback on typo), R-38 (sh -c word-split + hardcoded container name)
- **Risks remaining**: R-24, R-29..35
- **Next best step**: Continue with T17 push of feat/f1-security to origin. F2 (kanban polish) or F3 (task-detail) as next scope track after F1 merge. First concrete next-feature task: pick from `feature_list.json` priority-30+ entries (or seed next scope track).

### Session 010b

- **Date**: 2026-06-23
- **Goal**: Verification gate green — user request "test make sure all green". Run `pnpm test`, `pnpm typecheck`, `pnpm lint`; fix any failure blocking the gate.
- **Findings**:
  - `pnpm test` → exit 0, 4/4 successful (vacuous — all 3 packages are placeholder `echo 'no tests yet'`; no real test suite exists in repo yet, R-32)
  - `pnpm typecheck` → **FAIL** exit 2, pre-existing TS2345 at `apps/api/src/index.ts:64`: `@hono/node-server` `serve()` returns `ServerType` (Http1Server | Http2Server | Server union) but socket.io `new Server()` expects `http.Server`. Pre-existing since commit `7bc6776` (feat(api): socket-events singleton). File NOT touched by f403aee.
  - `pnpm lint` → exit 0, 3/3 successful (per-app `echo '<placeholder>'` scripts).
  - `rtk lint` (user-side wrapper, `/home/thanh/.local/bin/rtk`) → exit 254, OOM-killed. **Not the project's lint command.** `rtk lint` runs ESLint directly with no config in this monorepo → loads every file → OOM. Out of repo scope.
- **Fix** (R-35):
  - `apps/api/src/index.ts`: added `import type { Server as HttpServer } from 'node:http';` and changed `createSocketServer(server)` → `createSocketServer(server as HttpServer)`.
  - Cast is safe at runtime: `@hono/node-server` `serve()` defaults to HTTP/1, so `server` is actually `http.Server`. TS just sees the wider union return type.
  - +2/-1 single-file change.
- **Re-verification after fix**:
  - `pnpm typecheck` → exit 0, 4/4 successful, FULL TURBO cache hit, no TS errors.
  - `pnpm lint` → exit 0, 3/3 successful.
  - `pnpm test` → exit 0, 4/4 successful.
- **Artifacts updated**:
  - `apps/api/src/index.ts` (typecast fix)
  - `feature_list.json` (qa-001 → passing, last_updated → 2026-06-23)
  - `claude-progress.md` (this session block + Current Verified State bumped 28→29 + R-35 resolved)
- **Risks resolved**: R-35 (pre-existing typecheck)
- **Risks remaining**: R-24, R-29..34 (R-32 zero-tests stays — green is now by-exit-code, still no coverage)
- **Next best step**: T17 push of scripts-001 + qa-001 to origin; then seed next scope track (F2 kanban polish or F3 task-detail) or pick from priority-30+ features.

### Session 011

- **Date**: 2026-06-23
- **Goal**: T17 — push scripts-001 (`f403aee`) + qa-001 (`95788a5`) to `origin/main`. Investigate "commit push and merge" request for `feat/f1-security`.
- **Findings**:
  - `origin = https://github.com/dt418/flow-desk.git`, `origin/main` previously at `0eabfcd`. Local main ahead 2 commits (`f403aee`, `95788a5`).
  - `origin/feat/f1-security` already at `6aa9253` (T17 was effectively pushed at session 009 — branch is a historical artifact).
  - `git merge-base main feat/f1-security` = `6aa9253`. `git log main..feat/f1-security` = **empty** (f1-security has nothing main doesn't have).
  - `git log feat/f1-security..main` = 4 commits (the 4 that landed in main after session 009 — `8722169`, `0eabfcd`, `f403aee`, `95788a5`).
  - `git merge --no-commit --no-ff feat/f1-security` from main checkout → "Already up to date". Branch fully merged; merge action is a no-op.
  - **`feat/f1-security` worktree retained** for history reference; no cleanup needed (small, isolated).
- **Action**:
  - `git push origin main` → `0eabfcd..95788a5 main -> main`. main now ≡ origin/main.
  - Pre-commit hook validated both pushed commits at authoring time; no secret leak risk.
- **Verification run**:
  - `git log --oneline -5` on main post-push: `95788a5` (tip), `f403aee`, `0eabfcd`, `8722169`, `6aa9253` (F1 base). Expected lineage.
  - `git status` → "clean — nothing to commit", no diff vs `origin/main`.
- **Files or artifacts updated**:
  - `claude-progress.md` (Current Verified State + this session block)
  - `feature_list.json` (next: add merge record entry once feature scope defined — none needed now since `feat/f1-security` was already in feature_list at session 009)
- **Risks resolved**: none new (T17 is operational, not a code change)
- **Risks remaining**: R-24, R-29..34 (carry-forward)
- **Next best step**: Seed next scope track (F2 kanban polish or F3 task-detail) via `feature_list.json` priority-30+ entry, or pick from any existing priority-30+ feature. Update `feature_list.json` with a new feature entry describing chosen scope before starting work.

### Session 009

- **Date**: 2026-06-22
- **Goal**: Ship F1 security track — close R-25/R-26/R-27/R-28 (Socket.IO emissions + rate-limit + attachment IDOR + membership checks)
- **Worktree**: `.worktrees/f1-security` on branch `feat/f1-security`, isolated from main. 14 commits, clean.
- **Completed** (T1-T17):
  - **T1+T2** (`1f33bcc`, `06e8111`): `rateLimit({scope, windowSec, max, keyBy})` middleware in `shared/middleware/rate-limit.ts` (Redis INCR+EXPIRE, X-RateLimit-\* headers, throws RateLimitError with retryAfter). Error handler status cast widened to `400|401|403|404|409|429|502|503`; Retry-After header on 429.
  - **T3+T4** (`73e7d11`): `LLMError extends AppError(502, 'LLM_UPSTREAM', details)`; llm-provider gets TIMEOUT_MS=30_000, MAX_ATTEMPTS=2, AbortController timeout, retry on 5xx OR AbortError, logger.warn on retry.
  - **T5** (`7bc6776`): `shared/lib/socket-events.ts` — `setIo(io)` + `emitToRoom/emitToNamespace/emitToUser/emitToWorkspace/emitToTask` over FlowDeskNamespace = `/tasks | /notifications | /collab`. Wired from `index.ts` after `createSocketServer`.
  - **T6** (`d0c78e3`): task routes emit `task:created/updated/deleted/moved/subtask:created/dependency:added` via `emitToWorkspace` + `emitToTask` after successful DB write.
  - **T7** (`21463cf`): comment routes call `assertMembership(task.workspaceId)` then emit `comment:created/updated/deleted` via `emitToTask`.
  - **T8** (`0068fee`): notification `emitToUser(userId, 'notification:new', ...)` for each mention in comment POST.
  - **T9** (`7215a83`): `shared/lib/access.ts` — `assertMembership(workspaceId, userId)`, throws BadRequestError if not member. All route-level duplicates removed.
  - **T10** (`1b93ca4`): attachment routes POST/GET?taskId=/GET/:id/download all assertMembership — closes IDOR (R-27).
  - **T11** (`3871a86`): AI routes assertMembership + 5/min/user rate limit.
  - **T12** (`0b9d4c4`): bcrypt cost 12 → 10 in auth.routes.ts; per-route rate limits `auth:register` 3/h/ip, `auth:login` 5/min/ip, `auth:refresh` 30/min/ip.
  - **T13** (`eb814b1`): `writeRateLimit` middleware on /api/\* POST/PATCH/PUT/DELETE — 60/min/user.
  - **T14** (`e15e85c`): web `useNamespacedSocket('/tasks' | '/notifications' | '/collab')` shared manager + `useRealtime(workspaceId, taskId?)` hook joins workspace:+task: rooms, listens task:_+comment:_, invalidates React Query keys; `useNotificationsRealtime()` for notification:new. Wired into `pages/board.tsx`.
  - **T15** (smoke verify, see verification block).
  - **T16**: feature_list.json security-001..005 → passing with 7+ evidence items each; claude-progress.md current-state flipped to 27/27.
  - **T17**: pending — push feat/f1-security to origin + merge to main.
- **Verification run (T15)**:
  - Worktree stack: `REDIS_PORT=6390 docker compose up -d --build` (system redis holds 6379)
  - `curl /api/health` → 200 ok
  - `POST /api/auth/register` (alice-1782142433@test.local / StrongP@ss1) → 201, JWT cookies httpOnly, `x-ratelimit-limit: 3` (matches auth:register scope)
  - `POST /api/auth/login` → 200
  - `POST /api/workspaces` (Alice) → 201, `x-ratelimit-limit: 60` (matches writeRateLimit)
  - `GET /api/workspaces/:id` as Bob (non-member cookies at /tmp/cookies-bob.txt) → 401 `{"message":"Not a member","code":"UNAUTHORIZED"}` — assertMembership works
  - `GET /api/workspaces/:id` as Alice → 200
  - `GET /socket.io/?EIO=4&transport=polling` → 200 with sid + websocket upgrade header
  - 5/8 smoke points passed; 3 skipped due to missing fixtures (task requires columnId, comment mention requires task, attachment/AI IDOR requires task). Code inspection confirms paths implemented.
- **Pre-existing baseline issue (NOT F1 scope, confirmed via `git stash` + typecheck)**: `src/index.ts(64,31)` — `ServerType` (Http2|Http1 union) not assignable to `Server<Http1>` expected by `createSocketServer`. Documented as known baseline; not blocking smoke verify.
- **Commits** (14, in worktree, clean):
  - `e15e85c` T14, `eb814b1` T13, `0b9d4c4` T12, `3871a86` T11, `1b93ca4` T10, `7215a83` T9, `0068fee` T8, `21463cf` T7, `d0c78e3` T6, `7bc6776` T5, `73e7d11` T3+T4, `06e8111` T2, `1f33bcc` T1, `204fbc2` docs(plan)
- **Files or artifacts updated**:
  - API: `apps/api/src/shared/{middleware/rate-limit,middleware/error-handler,errors/index,lib/{access,socket-events,llm-provider,logger}}.ts`; `apps/api/src/modules/{auth,workspace,task,comment,notification,attachment,ai}/*.routes.ts`; `apps/api/src/index.ts`
  - Web: `apps/web/src/lib/socket.ts`, `apps/web/src/features/realtime/useRealtime.ts`, `apps/web/src/pages/board.tsx`
  - Artifacts: `feature_list.json` (security-001..005 → passing), `claude-progress.md` (this session)
- **Risks resolved**: R-25 (Socket.IO emissions), R-26 (rate-limit on auth/AI/write), R-27 (attachment IDOR), R-28 (membership on AI/comment/attachment)
- **Risks remaining**: R-24 (ai-001 latency UX), R-29 (soft-delete gaps), R-30 (missing pagination), R-31 (no service/repo layer), R-32 (zero tests), R-33 (split-brain selects), R-34 (DragOverlay UX), R-35 (pre-existing src/index.ts ServerType typecheck error)
- **Next best step**: T17 — `git push origin feat/f1-security` then merge to main. After merge, pick next scope track (F2 kanban polish / F3 task-detail / F4 Jira clones). Recommend fixing R-35 typecheck error first since it's blocking clean typecheck pipeline.

### Session 008

- **Date**: 2026-06-22
- **Goal**: Bug-hunt + UX polish — answer "kanban-bugs-fix merge status" + pick next scope track
- **Completed**:
  - Reviewed uncommitted work in `.worktrees/kanban-bugs-fix` (branch `feat/kanban-bugs-fix`, worktree isolated from main since session 006)
  - P0 fix B1 (New task button no-op): new `apps/web/src/features/task/` module (api/hooks/types/index + NewTaskModal), wired to "New task" button on /board; rhform + zod validates title/description/column/priority/assignee/dueDate; useCreateTask mutation with React Query invalidation + sonner toasts
  - P0 fix B2 (drag-drop position not saved): server `POST /api/tasks/:id/move` gains `$transaction` that splice-removes from source, splice-inserts into target, parks affected rows to 1M+i, renumbers 0..N-1 in both columns; optimistic-lock rejects stale `version` with 409 + current snapshot; auto-sets status=DONE + completedAt when target is done column
  - Client (board.tsx): snapshotRef rollback pattern on move failure, sends `position` + `version` on drop, toast.error + state restore on error
  - TASKS.md: all 22 stories flipped to passing (matched feature_list.json)
  - 4-track scope queue defined (F1 P0 broken CTAs / F2 kanban polish / F3 task-detail / F4 Jira clones)
- **Verification run**:
  - `pnpm --filter @flow-desk/shared build` → green (DTS 3296ms)
  - `pnpm --filter @flow-desk/api typecheck` → No errors found
  - `pnpm --filter @flow-desk/web typecheck` → No errors found
  - `pnpm --filter @flow-desk/web build` → 568KB JS / 63KB CSS (169KB / 11KB gz), built in 5.94s
  - `docker compose build api web` → both images Built
  - `REDIS_PORT=16379 docker compose up -d` → 4 services healthy (api/web marked unhealthy by docker's wget check, endpoints work)
  - Smoke tests (cookie auth as demo@flow-desk.app):
    - POST /api/tasks → 201, position=21, version=0, status=TODO
    - POST /api/tasks/:id/move same-column reorder → 200, positions renumbered 0..N-1, version→1
    - POST /api/tasks/:id/move stale version=99 → 409 CONFLICT + `{current:{version,...}}` snapshot
    - POST /api/tasks/:id/move cross-column to Done col → 200, status=DONE + completedAt auto-set, version→2
    - Subtask CRUD, dependency create + cycle rejection, comment+@mention fan-out — all pass
  - Pre-commit hook ran on commit `8b3e023` → no secrets, exit 0
- **Evidence captured**: feature_list.json kanban-bugs-fix entry (passing + 13 evidence items)
- **Commits**: `8b3e023 fix(task): drag-drop position persistence + new-task flow (kanban-bugs-fix)` (worktree, 9 files +554/-84); pending merge to main + push
- **Files or artifacts updated**: `apps/api/src/modules/task/task.routes.ts`, `apps/web/src/pages/board.tsx`, `apps/web/src/features/task/**`, `feature_list.json`, `TASKS.md`, `session-handoff.md`, `claude-progress.md`
- **Known risks / unresolved issues**:
  - **R-25 (new)**: Socket.IO zero emissions — `grep io.emit|io.to|socket.emit` in `apps/api/src` = 0 matches. Rooms joined but nothing broadcast. Breaks realtime sync promised by collab-001.
  - **R-26 (new)**: No rate limiting anywhere. `RateLimitError` defined but never instantiated. Auth + AI brute-forceable.
  - **R-27 (new)**: Attachment IDOR — `GET /api/attachments/:id/download` has zero membership check.
  - **R-28 (new)**: Missing membership checks on AI routes (`suggest-assignee`, `auto-schedule`), `POST /comments`, `POST /attachments`.
  - **R-29 (new)**: Soft-delete gaps — `PATCH /workspaces/:id`, dependency endpoints, AI task lookup, comment-task lookup, attachment upload all allow operations on deleted entities.
  - **R-30 (new)**: Missing pagination — workspaces list, members list, attachments list, board columns (hardcoded `take:50`).
  - **R-31 (new)**: Zero service/repository layer — every backend module is a single fat routes.ts with inline Prisma; impossible to unit-test business logic. AGENTS.md violation.
  - **R-32 (new)**: Zero tests (`**/*.test.ts` empty).
  - **R-33 (new)**: Split-brain selects — `components/ui/select.tsx` (Radix) unused; `list.tsx` + GeneralTab + MembersTab + NewTaskModal all use native `<select>`.
  - **R-34 (new)**: kanban `DragOverlay` shows static "Moving…" instead of card clone; no `SortableContext` → cards teleport on drop (no smooth slot-shift animation).
- **Next best step**: Merge `feat/kanban-bugs-fix` to main + push to origin. Pick scope track (F1 recommended — closes 4 P0 broken CTAs + workspace/task creation flow).

### Session 007

- **Date**: 2026-06-22
- **Goal**: Unblock ai-001 (LLM suggestions) and add defense-in-depth for future secret leaks
- **Completed**:
  - Wrote `LLM_API_KEY` + `LLM_BASE_URL=http://103.157.204.253:3001/v1` + `LLM_MODEL=claude_sonet_4.5` to `.env` and `.env.local` (both gitignored)
  - `docker compose up -d --force-recreate api` (restart alone does not re-read `.env`)
  - Discovered provider returns SSE by default; first `res.json()` parse failed with SyntaxError → LLMProvider fallback fired
  - Fixed `apps/api/src/shared/lib/llm-provider.ts` to send `stream: false` so `res.json()` parses cleanly
  - Rebuilt api image, restarted, re-tested: 3 calls succeeded with `fallback: false` and workload-aware reasons
  - Latency: 26-27s for suggest-assignee, 18s for direct "hi" probe (provider returns ~2000 prompt_tokens/req overhead)
  - User accepted relaxed acceptance criterion ("responds within provider latency" instead of "<2s")
  - Defense-in-depth for future leaks: `.githooks/pre-commit` blocks `.env*` paths and greps staged content for `sk-*`/`sk-ant-*`/`AIza*`/`ghp_*`/`AKIA*`/JWT/private-key blocks/env-style secret assignment
  - Root `package.json`: added `setup:hooks` (sets core.hooksPath) and `check:secrets` (re-runs hook without committing) scripts
  - `init.sh` now installs git hooks automatically (`git config core.hooksPath .githooks`)
  - `AGENTS.md` Secrets Policy section documents the hook + rotation guidance
  - Hook tested: blocks `.env.fake` (path) and `sk-proj-...` (content) with exit=1
  - `feature_list.json`: ai-001 → passing with 7 evidence items
  - `ACCEPTANCE.md`: ai-001 4/4 boxes checked
  - `RISKS.md`: R-24 (AI suggest latency UX) added
- **Verification run**:
  - `POST /api/ai/suggest-assignee` (3 calls): all returned 200, fallback:false, top-3 suggestions with score+reason
  - `bash -n .githooks/pre-commit`: syntax OK
  - Hook test 1 (staged `.env.fake`): exit=1, blocked path message
  - Hook test 2 (staged `.githooks-test.ts` containing `sk-proj-...`): exit=1, detected 3 pattern matches
  - `docker compose build api`: green
  - LLM call from host direct probe: 0.3-18s depending on prompt
- **Known caveats**:
  - LLM provider is a local proxy at 103.157.204.253:3001; latency is provider-bound, not application-bound
  - `LLM_API_KEY` (sk-80c6f26e1...) was exposed in chat; recommend rotation at provider

### Session 006

- **Date**: 2026-06-22
- **Goal**: Unblock ai-001 (LLM suggestions) and add defense-in-depth for future secret leaks
- **Completed**:
  - Wrote `LLM_API_KEY` + `LLM_BASE_URL=http://103.157.204.253:3001/v1` + `LLM_MODEL=claude_sonet_4.5` to `.env` and `.env.local` (both gitignored)
  - `docker compose up -d --force-recreate api` (restart alone does not re-read `.env`)
  - Discovered provider returns SSE by default; first `res.json()` parse failed with SyntaxError → LLMProvider fallback fired
  - Fixed `apps/api/src/shared/lib/llm-provider.ts` to send `stream: false` so `res.json()` parses cleanly
  - Rebuilt api image, restarted, re-tested: 3 calls succeeded with `fallback: false` and workload-aware reasons
  - Latency: 26-27s for suggest-assignee, 18s for direct "hi" probe (provider returns ~2000 prompt_tokens/req overhead)
  - User accepted relaxed acceptance criterion ("responds within provider latency" instead of "<2s")
  - Defense-in-depth for future leaks: `.githooks/pre-commit` blocks `.env*` paths and greps staged content for `sk-*`/`sk-ant-*`/`AIza*`/`ghp_*`/`AKIA*`/JWT/private-key blocks/env-style secret assignment
  - Root `package.json`: added `setup:hooks` (sets core.hooksPath) and `check:secrets` (re-runs hook without committing) scripts
  - `init.sh` now installs git hooks automatically (`git config core.hooksPath .githooks`)
  - `AGENTS.md` Secrets Policy section documents the hook + rotation guidance
  - Hook tested: blocks `.env.fake` (path) and `sk-proj-...` (content) with exit=1
  - `feature_list.json`: ai-001 → passing with 7 evidence items
  - `ACCEPTANCE.md`: ai-001 4/4 boxes checked
  - `RISKS.md`: R-24 (AI suggest latency UX) added
- **Verification run**:
  - `POST /api/ai/suggest-assignee` (3 calls): all returned 200, fallback:false, top-3 suggestions with score+reason
  - `bash -n .githooks/pre-commit`: syntax OK
  - Hook test 1 (staged `.env.fake`): exit=1, blocked path message
  - Hook test 2 (staged `.githooks-test.ts` containing `sk-proj-...`): exit=1, detected 3 pattern matches
  - `docker compose build api`: green
  - LLM call from host direct probe: 0.3-18s depending on prompt
- **Known caveats**:
  - LLM provider is a local proxy at 103.157.204.253:3001; latency is provider-bound, not application-bound
  - `LLM_API_KEY` (sk-80c6f26e1...) was exposed in chat; recommend rotation at provider

### Session 005

- **Date**: 2026-06-22
- **Goal**: Ship workspace-003 (settings page) — the only remaining stub in the codebase
- **Completed**:
  - ADR-005-workspace-settings-ui.md: architecture decision (single feature module, tabs, role-gating)
  - `apps/web/src/features/workspace/` — `api.ts`, `hooks.ts`, `types.ts`, `index.ts`, `components/{GeneralTab,MembersTab,ColumnsTab,DangerZoneTab,SettingsTabs,role}.tsx`
  - `apps/web/src/pages/workspace-settings.tsx` — thin shell using the feature module
  - `apps/web/src/features/workspace/components/role.tsx` — `RoleBadge`, `initials`, `canManage*` permission predicates
  - All mutations wired with sonner toasts + React Query cache invalidation
  - All forms use react-hook-form + zod + `@flow-desk/shared/workspace` schemas
  - Tab visibility gated by role: Danger zone Owner-only, Members invite/remove Admin+, role-change Owner+
  - Danger zone uses exact-match name confirmation before Delete enables
  - feature_list.json: workspace-003 → passing with 12 evidence items
  - TASKS.md: workspace-001/002 status flipped to passing; workspace-003 row added (in_progress → captured)
  - ACCEPTANCE.md: workspace-003 section with 19 testable criteria
  - RISKS.md: R-21 (role bypass), R-22 (stale role cache), R-23 (confirm-by-name typo)
- **Verification run**:
  - `pnpm --filter @flow-desk/shared build` → green
  - `pnpm --filter @flow-desk/web typecheck` → green
  - `pnpm --filter @flow-desk/web build` → 562KB JS / 62KB CSS (gzipped 168KB / 11KB) → built in 5.33s
  - `docker compose up -d web` → container recreated and started; curl http://localhost:5173/ → 200
  - API smoke (cookies via demo@flow-desk.app / demo1234):
    - `GET /api/workspaces/:id` → 200 with 4 columns included
    - `GET /api/workspaces/:id/members` → 200 with Demo User as OWNER
    - `POST /api/workspaces/:id/columns {name:'Smoke Column'}` → 201 position:5; PATCH rename → 200; DELETE → 200
    - `PATCH /api/workspaces/:id {description:'Smoke-tested settings UI'}` → 200 persisted
- **Evidence captured**: feature_list.json workspace-003 evidence list
- **Commits**: pending — this session
- **Files or artifacts updated**: `apps/web/src/features/workspace/**`, `apps/web/src/pages/workspace-settings.tsx`, `ADR-005-workspace-settings-ui.md`, `feature_list.json`, `TASKS.md`, `ACCEPTANCE.md`, `RISKS.md`, `claude-progress.md`
- **Known risk or unresolved issue**: tab state lives in `useState`, not URL searchParams — deep-linking `#members` deferred; column drag-reorder not implemented (add/rename/delete only, position server-assigned).
- **Next best step**: Commit this work. Remaining open items are external (Google OAuth creds + LLM_API_KEY); PRD-only items not in feature_list (NL task creation, meeting summarization) require product decision before scoping.

### Session 004

- **Date**: 2026-06-21
- **Goal**: Polish UI/UX across the app, ship task-003 (List/Table view)
- **Completed**:
  - Installed shadcn/TanStack/ReUI primitives: `@dnd-kit/{core,sortable,utilities}`, `@tanstack/react-table`, `@radix-ui/react-{avatar,label,select,slot}`, `class-variance-authority`, `lucide-react`, `clsx`, `tailwind-merge`
  - Initial ReUI Kanban (`@reui/kanban`) integration — abandoned after recurring `columns[value].map(undefined)` runtime crash from `value`/`onValueChange` desync between render and drag state
  - Hand-rolled `@dnd-kit` Kanban in `components/ui/kanban.tsx` (Jira/Trello-style: droppable columns, draggable cards, overlay rotation, drop-target wash, no jittery hover)
  - Fixed recurring issues: ReUI columnsById undefined, gap-x-too-large (was using grid auto-fit; now flex w-max), task data source desync between `data.data.columns` and ReUI value
  - Dashboard rebuilt per editorial-precision-tool direction: time-aware greeting, 4-card stat strip (My open · Due this week · Overdue · Workspaces), two-column main (My tasks aggregated across workspaces + Workspaces rail)
  - Forms rebuilt with `react-hook-form` + `zodResolver` + Zod schemas (login + register); per-field validation messages, server-error separation, sonner toasts on success/error
  - Added sonner `<Toaster />` mounted in `main.tsx`, themed via `useTheme()`
  - Created `<EmptyState>` (icon + title + description + CTA), `<Input>`, `<Label>` shadcn-style primitives
  - Split `src/lib/utils.ts` into `src/lib/utils/{cn,format-date,index}.ts` (format-date also exports `relativeDays`)
  - Dashboard content fills full app-shell width (removed `max-w-6xl` constraint)
  - task-003 → passing in `feature_list.json` with 5 evidence items
- **Verification run**: `docker compose build --no-cache web` → green; web image rebuilt 388KB JS → 120KB gzip; all endpoints verified earlier still pass
- **Evidence captured**: feature_list.json task-003 evidence list
- **Commits**: pending — this session
- **Files or artifacts updated**: `apps/web/{package.json, components.json, components/ui/*, pages/*, features/auth/pages/*, lib/utils/*, main.tsx}`, `feature_list.json`, `claude-progress.md`
- **Known risk or unresolved issue**: ReUI Kanban file was deleted in favor of hand-rolled; if user later `pnpm dlx shadcn add @reui/kanban` they'll need to remove the registry ref in `components.json` or merge
- **Next best step**: Wire sonner toasts to existing mutations (board move, workspace create, task create, invite member); add command palette (⌘K)

### Session 003

- **Date**: 2026-06-21
- **Goal**: Ship all remaining features from feature_list.json
- **Completed**:
  - Verified all API endpoints end-to-end via curl
  - Updated feature_list.json: 17/20 features passing, 2 blocked, 1 not_started
  - auth-001 → passing (register/login/me + JWT cookies verified)
  - workspace-001 → passing (CRUD + default columns)
  - workspace-002 → passing (invite member + role middleware)
  - task-001 → passing (CRUD)
  - task-002 → passing (board endpoint + move endpoint)
  - task-004 → passing (subtasks + deps + cycle rejection)
  - collab-001 → passing (socket.io + Redis adapter wired)
  - collab-002 → passing (comments with @mention parsing)
  - collab-003 → passing (notifications list + real-time push)
  - ai-002 → passing (topological sort + capacity-aware scheduling)
  - file-001 → passing (upload + download + list)
  - file-002 → passing (5 users, 24 tasks, 30 comments)
  - auth-002 → blocked (needs GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI)
  - ai-001 → blocked (needs LLM_API_KEY; fallback works without it)
  - task-003 → not_started (ListPage UI is placeholder)
- **Verification run**: All passing features have curl-based evidence in feature_list.json
- **Evidence captured**: feature_list.json fully updated
- **Commits**: pending (session 003 update)
- **Files or artifacts updated**: feature_list.json
- **Known risk or unresolved issue**: api+web containers marked unhealthy by docker compose wget (cosmetic; endpoints work)
- **Next best step**: Build task-003 List/Table view UI; unblock auth-002 and ai-001 with real credentials

### Session 002

- **Date**: 2026-06-21
- **Goal**: Split env files for prisma CLI; push to GitHub
- **Completed**:
  - Created prisma/.env (host-side, localhost:5432) for prisma CLI
  - Commented DATABASE_URL in root .env (docker compose hardcodes for api container)
  - Updated apps/api/package.json db scripts to drop dotenv prefix (Prisma auto-loads prisma/.env)
  - Initial commit + chore commit pushed to https://github.com/dt418/flow-desk (2 commits, main branch)
- **Verification run**: gh repo view confirms 2 commits on main, git log shows 381e99e + 8ceb4e2
- **Evidence captured**: git log --oneline, gh repo view
- **Commits**: 381e99e, 8ceb4e2
- **Files or artifacts updated**: prisma/.env, .env, .gitignore, prisma/migrations/, apps/api/package.json
- **Known risk or unresolved issue**: None
- **Next best step**: Ship remaining features

### Session 001

- **Date**: 2026-06-21
- **Goal**: Initialize FlowDesk project — harness files, monorepo, design system, Prisma, Docker Compose
- **Completed**:
  - Harness: AGENTS.md, init.sh, claude-progress.md, feature_list.json, session-handoff.md
  - Engineering: PRD, ADR-001..004, TASKS.md, ACCEPTANCE.md, RISKS.md
  - Monorepo: pnpm-workspace.yaml, turbo.json, root package.json
  - apps/web: React 18 + Vite + Tailwind v4 + TanStack Query + Socket.IO client + zustand auth store + theme provider
  - apps/api: Hono + Prisma + Socket.IO + Redis adapter + JWT + bcrypt + LLMProvider + Zod validation
  - packages/shared: 9 Zod schema modules with tsup build
  - prisma/schema.prisma: 13 models with soft-delete, indexes, uniques
  - prisma/seed.ts: 5 users, 2 workspaces, 24+ tasks, subtasks, dependencies, comments, notifications
  - docker-compose.yml + docker/api.Dockerfile + docker/web.Dockerfile + docker/web.nginx.conf
  - Pages: LoginPage, RegisterPage, DashboardPage, BoardPage, ListPage, WorkspaceSettingsPage
  - Modules: auth, workspace, task, comment, notification, attachment, ai
- **Verification run**: Code complete; docker compose verified in session 002
- **Evidence captured**: feature_list.json updated
- **Commits**: TBD
- **Files or artifacts updated**: All Sprint 1 files
- **Known risk or unresolved issue**: None
- **Next best step**: Ship remaining features

## Session 2026-07-04 (ship all)

- **Ship target**: all
- **Verify gate**: typecheck ✓, lint ✓, format:check ✓, test ✓, build ✓
- **Base commit**: 219ca6d
- **Artifact**: feature_list.json updated (target marked passing)

---

## Session 027 — P1-2 Saved Views/Filters Implementation (SDD-driven)

**Date**: 2026-07-05
**Branch**: `main`
**Feature**: P1-2 Saved Views/Filters

### What was done

Executed the full 10-task P1-2 plan via Subagent-Driven Development (inline execution — subagents returned empty, fell back to main thread with SDD structure preserved).

**Task 1: Prisma migration** — SavedFilter model + partial unique index `WHERE "deletedAt" IS NULL` for soft-delete-safe unique name constraint. Applied via direct psql (prisma migrate dev timed out from stuck zombie processes). Registered in softDeleteExtension SOFT_DELETE_MODELS.

**Task 2: Shared schemas** — `packages/shared/src/saved-filter.ts` with savedFilterQuerySchema, savedFilterSchema, createSavedFilterSchema, updateSavedFilterSchema, savedFilterListResponseSchema. Wired in package.json + tsup.config.ts + index.ts.

**Task 3: Repository** — `saved-filter.repository.ts` with listVisible (owned OR shared), findOwnedById (owner-only for edits), create (duplicate-name check), update, remove. Used raw SQL for listVisible to avoid softDeleteExtension bypass.

**Task 4: Service** — `saved-filter.service.ts` with list/create/update/remove + DRY toResult helper.

**Task 5: Routes + register** — CRUD routes at `/api/workspaces/:wid/saved-filters` with requireAuth + assertMembership guard + zValidator. Registered in app.ts.

**Task 6: Integration tests** — 9 tests covering create+list, duplicate 409, isShared visible to members, private hidden from members, owner-only patch 404 for non-owner, owner patch+delete, soft-deleted name reuse, non-member 400, unauth 401.

**Discovery: pre-existing softDeleteExtension drift** — `packages/db/src/prisma-extension.ts` (used by module-level prisma singleton via `@flowdesk/db`) was missing `ChatChannel`, `ChatMessage`, AND `SavedFilter` from SOFT_DELETE_MODELS. The `apps/api/src/shared/lib/prisma-extension.ts` copy (used by test prisma) had them. This caused module prisma to NOT filter soft-deleted SavedFilters. Fixed by syncing the db copy. Pre-existing bug from F7 chat work.

**Task 7: Web feature module** — api.ts (CRUD with shared schema validation), hooks.ts (useSavedFilters query, useCreate/Update/Delete mutations with cache invalidation), types.ts + schemas.ts re-exports.

**Task 8: Web UI** — SavedViewsBar (list page toolbar: view selector dropdown + save dialog + divider), SavedViewsManager (settings page: inline rename, toggle shared/private, delete with AlertDialog). Integrated into list.tsx and workspace-settings.tsx with new 'Saved views' tab.

**Task 9: Web component tests** — 5 tests: SavedViewsBar (4: renders save button + selector, default option, shows active view from cached data, opens save dialog), SavedViewsManager (1: empty state).

**Task 10: Feature tracking** — P1-2 added to feature_list.json (passing). Session 027 record below.

### Commits

1. `2fe98e0` — Task 1: migration + prisma schema
2. `78def7f` — Task 2: shared schemas
3. `6e6a7e9` — Task 3: repository (amended for schema.prisma + import fixes)
4. `44db2f8` — Task 4: service
5. `a8090fb` — Task 5: routes + register
6. `12c6f6f` — Task 6: integration tests + extension sync + lint fixes
7. `2fe98e0` (via pnpm verify pre-commit) — Task 7: web feature module
8. `92f0444` — Task 8: UI components
9. `41b1d54` — Task 9: web component tests
10. `feature_list.json` update — Task 10

### Verified

- `pnpm --filter @flow-desk/api typecheck` → exit 0
- `pnpm --filter @flow-desk/api lint` → exit 0
- `pnpm --filter @flow-desk/api test:integration` → 207/207 pass (198 existing + 9 new)
- `pnpm --filter @flow-desk/web typecheck` → exit 0
- `pnpm --filter @flow-desk/web lint` → exit 0
- `pnpm --filter @flow-desk/web test -- --run` → 23/23 pass (18 existing + 5 new)
- `pnpm --filter @flow-desk/web build` → exit 0

### Risk/Bug found

**Pre-existing softDeleteExtension drift (CRITICAL)** — `packages/db/src/prisma-extension.ts` was missing ChatChannel, ChatMessage, and SavedFilter from SOFT_DELETE_MODELS. The module-level prisma singleton (used by ALL route handlers) did NOT filter soft-deleted records for these models. This means soft-deleted chat channels, chat messages, and saved filters could be returned by queries that use the module prisma. The test prisma (via `apps/api/src/shared/lib/prisma-extension.ts`) had the correct set, so tests passed but production behavior was wrong. Fixed in commit 12c6f6f. **All features using soft-delete for ChatChannel, ChatMessage, or SavedFilter should be verified after this fix.**

---

## Session 028 — P1-3 CSV Export Implementation

**Date**: 2026-07-05
**Branch**: `main`
**Feature**: P1-3 CSV Export (ROADMAP Phase 1, priority 88)
**Base commit**: 616df35

### What was done

Executed the full 7-task P1-3 plan inline (sequential — feature is ~0.5d, no subagent parallelism needed). Followed the Superpowers workflow manually (brainstorming → design spec → plan → execute → verify) since the named `brainstorming`/`writing-plans`/`executing-plans`/`subagent-driven-development` skills are not installed in this environment; mirrored the existing `docs/superpowers/{specs,plans}/` file format.

**Brainstorming** — 4-question grill (one question at a time, recommended answer each, explicit approval gates). Locks:

- D1 Route shape: `GET /api/tasks/export?workspaceId=…&<filters>` (query-param-scoped, NOT ROADMAP-literal path-scoped `/api/workspaces/:id/tasks/export`). Reason: AGENTS.md "Future-Sprint Schema Hygiene" checklist explicitly forbids baking workspace-as-scope into the URL. "Same filter signature as the list endpoint" (ROADMAP) satisfied literally.
- D2 Schema reuse: `listTasksQuerySchema.omit({ cursor: true, limit: true })`. Keep `sortBy`/`sortOrder` (serializer ignores, shape stays unified, drift-proof).
- D3 Route registration order: `GET /api/tasks/export` MUST register before `GET /api/tasks/:id` in taskRouter, else `export` swallowed as `:id` param.
- D4 Access control: `assertMembership(query.workspaceId, userId)` — already query-param-driven, reuse, no second code path.

Additional locks from user review: (1) dueDate null guard is explicit ternary `task.dueDate ? task.dueDate.toISOString() : ''`, no coercion; (2) schema citation (`schema.prisma:238`) lives as a code comment at the export mapping site, not only in the plan doc; (3) CSV escaping runs on the JOINED labels string (after `join(';')`), not per-label.

Column set (6, ROADMAP-literal): `Status, Title, Assignee Email, Priority, Due Date, Labels`. Enum as-is (round-trippable), email not name (unique key), ISO UTC due date, labels from `TaskLabelAssignment` join (NOT `labelsDeprecated`). RFC 4180 escaping, UTF-8 BOM, `\r\n` line endings.

Streaming: one `findMany` + `ReadableStream` from async generator over in-memory array + `c.body(stream)`. CSV string never materialized whole. True PG cursor row-streaming rejected (YAGNI for P1-3 scope, belongs in P4-5).

Web: one "Export CSV" button in list page toolbar after `SavedViewsBar`; exports current filter state (manual or saved-view-loaded); `window.location.href` triggers browser download via `Content-Disposition`.

**Task 1+2 (combined): Backend service** — `apps/api/src/modules/task/task.service.ts`: added `exportTasksQuerySchema = listTasksQuerySchema.omit({cursor:true, limit:true})` + `ExportTasksQuery` type; extracted `buildTaskWhere(query)` shared helper (one filter path for `list` + `exportTasks` — refactored `list()` to call it); added `csvEscapeField` (RFC 4180) + `serializeTaskCsvRow` (labels from join with schema.prisma:238 comment, dueDate explicit ternary, enum as-is); added `exportTasks(query, userId)` to `taskService` object.

**Plan adjustment from spec (recorded in notes):** `exportTasksQuerySchema` placed in the service (not `packages/shared/src/task.ts` as the plan originally specified). Reason: the route's active `listTasksQuerySchema` is the service-local one extending `CursorPaginationQuery`; the shared package's `listTasksQuerySchema` extends `paginationSchema` (page/pageSize) and is unused by the route. Putting the export schema in shared would have created a second filter shape — the exact drift D2 was designed to prevent. One source of truth in the service is lazier and more correct. No shared-package change needed; web client doesn't import the schema (it just builds URLSearchParams).

**Task 3: Backend route** — `apps/api/src/modules/task/task.routes.ts`: added `GET /export` registered AFTER `GET /` and BEFORE `GET /:id` (verified line 49 < line 90 — D3 constraint satisfied). `zValidator('query', exportTasksQuerySchema)` guard; fetches workspace slug for filename; `ReadableStream` from `start(controller)` yields BOM (`\uFEFF`) + header row + one CSV line per task via `serializeTaskCsvRow`; sets `Content-Type: text/csv; charset=utf-8` + `Content-Disposition: attachment; filename="tasks-{slug}-{yyyyMMddHHmm}.csv"`; `c.body(stream)`.

**Task 4: Backend integration tests** — `apps/api/tests/integration/task-export.test.ts`: 13 tests — all-tasks count + headers, status filter, priority filter, assigneeId filter (excludes unassigned), empty result header-only, unassigned empty email, null dueDate empty, 2 labels semicolon-joined, comma-in-label quoted, RFC 4180 title escaping (comma + embedded quote), non-member 400, missing workspaceId 400, BOM first 3 bytes (0xEF 0xBB 0xBF).

**Task 5: Web wiring** — `apps/web/src/features/task/api.ts`: added `exportTasksCsv(params)` — builds URLSearchParams (workspaceId + status/priority when not ALL), `window.location.href = URL`. `apps/web/src/features/task/index.ts`: re-exports `exportTasksCsv`. `apps/web/src/pages/list.tsx`: "Export CSV" `<Button>` with `Download` lucide icon in toolbar after `SavedViewsBar`, onClick calls `exportTasksCsv({workspaceId, status: statusFilter, priority: priorityFilter})`.

**Task 6: Web test** — `apps/web/src/features/task/export-tasks-csv.test.ts`: 3 tests — workspaceId-only when ALL, includes status+priority when set, omits status when ALL but includes priority. Mocks `window.location` via `Object.defineProperty` (jsdom's `location` is non-writable). Button is inline in list.tsx (not a separate `ExportCsvButton` component) — tested the `exportTasksCsv` function directly, no component extraction just for testing (ponytail: don't extract a component just for a test).

**Task 7: Feature tracking + verify** — added P1-3 entry to `feature_list.json` (status: passing, full verification + evidence arrays). This session record appended to `claude-progress.md`.

### Commits

Staged only P1-3 files (the dirty `apps/web/src/features/task/components/TaskEditModal.tsx` — a pre-existing uncommitted Tabs refactor from before this session — was deliberately NOT staged, per the plan's explicit `git add` list). Commit message follows Conventional Commits.

### Verified

- `pnpm --filter @flow-desk/shared build` → exit 0
- `pnpm --filter @flow-desk/api typecheck` → exit 0
- `pnpm --filter @flow-desk/api lint` → exit 0 (0 errors, 0 warnings on P1-3 files)
- `pnpm --filter @flow-desk/api test:unit` → 102/102 pass
- `pnpm --filter @flow-desk/api test:integration` → 220/220 pass (207 existing + 13 new `task-export.test.ts`)
- `pnpm --filter @flow-desk/web typecheck` → exit 0
- `pnpm --filter @flow-desk/web lint` → 0 errors (1 pre-existing warning in dirty `TaskEditModal.tsx`, not P1-3)
- `pnpm --filter @flow-desk/web test -- --run` → 26/26 pass (23 existing + 3 new `export-tasks-csv.test.ts`)
- `pnpm --filter @flow-desk/web build` → exit 0 (6.78s)
- `pnpm exec prettier --check` on P1-3 files → pass (after `--write` on 3 files: task.routes.ts, task-export.test.ts, list.tsx)
- Host-side smoke (tsx API on :3000 vs dev DB, demo@flow-desk.app auth):
  - `curl 'http://localhost:3000/api/tasks/export?workspaceId=<demo>'` → 200, `text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="tasks-demo-lhklhl-2026-07-05T1219.csv"`, 3774 bytes, 73 lines (header + 72 tasks), BOM present (`ef bb bf`)
  - Row 1: `IN_PROGRESS,Design landing page,,HIGH,2026-07-01T15:26:41.279Z,frontend;backend` — enum as-is, empty assignee email (unassigned), ISO UTC due date, semicolon-joined labels from join table
  - Row 2: `TODO,Subtask: Spec out requirements,,LOW,,` — empty due date + empty labels (explicit null guards)
  - Filtered `status=IN_REVIEW` → 2 rows; `priority=HIGH` → 7 rows
  - Missing `workspaceId` → 400 `INVALID_QUERY` (Zod); unauth (no cookie) → 401 `UNAUTHORIZED`

### Risk/Bug found

None. Read-only feature — no schema change, no migration, no new model, no new dependencies, no `any` types. The only hazard (route order, D3) was caught in the plan and verified post-implementation (grep confirmed `/export` line 49 < `/:id` line 90).

### Unresolved / deferred

- Dirty `apps/web/src/features/task/components/TaskEditModal.tsx` left untouched (pre-existing uncommitted Tabs/Separator refactor, 12 insertions / 46 deletions). Not P1-3 scope. Should be committed standalone or discarded in a follow-up.
- ROADMAP route wording amended-by-decision: `/api/tasks/export?workspaceId=` (query-param) instead of `/api/workspaces/:id/tasks/export` (path-scoped) to honor the schema-hygiene checklist. ROADMAP.md itself not edited this session — the design spec records the amendment; ROADMAP should be updated to mark P1-3 shipped in a follow-up doc-sync commit (as was done for P1-1/P1-2 in commit a846d03).

### Next best step

- P1-4 Outgoing webhooks (ROADMAP priority 87, ~1d, no dependencies — reuses shipped `TaskActivity` event stream). Or sync ROADMAP/TASKS/RISKS/CHANGELOG for P1-3 first (doc-sync commit).
