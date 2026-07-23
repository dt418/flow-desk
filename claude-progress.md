# Progress Log

### Session — Optional PgBouncer + PG_POOL_MAX (2026-07-22)

- **Goal**: Close remaining R-14 polish — optional pooler in compose + real per-process pool cap
- **Completed**:
  - `docker-compose.yml`: profile `pgbouncer` (`edoburu/pgbouncer:v1.23.1-p2`, transaction mode, host port 6432)
  - `DB_HOST` / `DB_PORT` parameterize api + email-worker `DATABASE_URL` (default still `postgres:5432`)
  - `PG_POOL_MAX` (default 10) → `packages/db` `createPrismaClient` sets `pg` Pool `max`
  - `docs/DEPLOY.md` §5 rewrite; RISKS R-14; `.env.example`; handoff
- **Verification**: `docker compose config` (with/without profile); image pull OK; `@flowdesk/db` typecheck green
- **Next**: optional web unit growth or product DIR via `/plan-feature`

### Session — Private channel UI (2026-07-22)

- **Goal**: UI for private channel ACL (create + invite members)
- **Completed**:
  - Create dialog: Private switch
  - ChannelMembersDialog: list/add/remove workspace members
  - ChannelItem/ChannelView lock badge; Members button on private channels
  - Shared `ChannelMember` type; chatApi + hooks
- **Verification**: web typecheck; web tests 39 (ChannelItem +2)
- **Next**: optional PgBouncer; more web tests as needed

### Session — Private channel ACL + CSP enforce (2026-07-22)

- **Goal**: Ship remaining review polish — private chat membership + CSP
- **Completed**:
  - Prisma `ChatChannelMember` + migration `20260722190000_chat_channel_member`
  - Private channels: creator auto-member; list/get/send gated; socket `conversation:join` gated
  - REST: `GET/POST /channels/:id/members`, `DELETE .../members/:userId`
  - nginx CSP flipped from Report-Only to enforcing
- **Verification**: api unit 176; integration 275 (private channel case); typecheck green
- **Next**: optional private-channel UI; PgBouncer if multi-replica

### Session — Review #4 attachments + GUEST write policy (2026-07-22)

- **Goal**: Finish remaining polish from project review (attachments + guest role)
- **Completed**:
  - Attachments: stream upload to disk, drop `.svg`, 1 GiB/24h per-user quota, safer download Content-Type
  - `assertCanWriteWorkspace` (OWNER/ADMIN/MEMBER); task create/update/delete/restore/move/subtask/dependency + attachment upload
  - GUEST remains read-only for those mutations
- **Verification**: integration 274 (attachment +4); api typecheck
- **Next**: optional full private-channel membership ACL; PgBouncer service if multi-replica

### Session — Review #2 deploy + #3 R-14 lite (2026-07-22)

- **Goal**: Deploy runbook/secrets + light scale hygiene from completion review
- **Completed**:
  - Production `GET /metrics` → 503 when `METRICS_TOKEN` unset (no longer world-readable)
  - JWT_SECRET production: reject low-entropy secrets (`Set` size &lt; 10)
  - `docs/DEPLOY.md`: secrets, metrics, Redis AUTH, backups, PgBouncer/pool notes, checklist
  - Compose: optional `REDIS_PASSWORD` + `REDIS_URL`; email-worker Redis TCP healthcheck
  - README / `.env.example` pointers
- **Verification**: api unit 176; integration 270 (health); api + env typecheck green
- **Next**: review #4 attachment harden; full PgBouncer service still operator-led

### Session — Review item 1 chat ACL / markRead (2026-07-22)

- **Goal**: Implement completion review #1 — chat markRead bind, double-emit fix, isPrivate honesty, task-channel authz
- **Completed**:
  - `markRead`: require message exists, not deleted, `channelId` match; no broadcast on miss
  - Socket `message:read`: service-only emit (no second gateway broadcast)
  - Channel create/update: always persist `isPrivate: false` until channel-member ACL ships
  - `getOrCreateTaskChannel(userId, workspaceId, taskId)`: `assertMembership` + task workspace bind
- **Verification**: api unit 176 (chat +3 markRead +2 channel); integration 270; api typecheck green
- **Next**: review completion order #2 deploy secrets runbook / #3 R-14 scale if continuing polish

### Session — Harness hygiene vs latest source (2026-07-18)

- **Goal**: Apply cross-check recommendations after comparing harness task to tip source
- **Completed**:
  - Confirmed chat product paths **unchanged** since smoke; security/QA findings still valid
  - Untracked `_workspace/harness-test/**`, `e2e/test-results/**`, `test-results/**` from git index
  - `.gitignore`: `_workspace/`, `test-results/`, `e2e/test-results/`
  - Updated `session-handoff.md` tip + Commands (`sync:agents`, structure test)
  - Re-ran `bash scripts/test-harness-structure.sh` → PASS
- **Verification**: structure script green; no product code change this commit
- **Next**: `/flowdesk-team` or `/plan-feature` as needed; optional chat residual ACL when product prioritizes

### Session — plan-feature v2.2 + agent team harness (2026-07-18)

- **Goal**: Setup agent team harness + fix plan-feature orchestration gaps
- **Completed**:
  - **Agent team harness** (revfactory/harness): agents `fd-{explorer,implementer,security,qa,docs}`, skills `flowdesk-team`, `flowdesk-implement`, `flowdesk-security-review`, `flowdesk-qa`, `harness`; multi-host adapters via `pnpm sync:agents`
  - **plan-feature v2.2**: audited 14 Superpowers Collaboration skills against plan-feature process; added `using-git-worktrees` to Inheritance; added `receiving-code-review` + `dispatching-parallel-agents` to mid-execute table; rewrote Step 4 Execute with dispatch table + activation triggers
- **Verification**: API 170, Web 37, Shared 31 tests pass; `pnpm sync:agents` OK (6 host trees, all symlinks verified)
- **Next**: use `/flowdesk-team` for multi-role ship/review; `/plan-feature` for product features

### Session — Security/ops audit ship 029–034 + review fixes (2026-07-15)

- **Goal**: Ship residual improve-audit plans 029–034 and address two review rounds of findings
- **Completed**:
  - **029**: Chat always requires workspace membership; typing gated on room join; integration OAuth cookies `Secure` in prod
  - **030**: Google OAuth respects 2FA via httpOnly challenge cookie; Slack/GitLab callback uses cookie workspaceId; Slack request signature verify
  - **031**: Task list filters `sprintId`/`type`; Sprint/Epic/List/Calendar pagination fixes
  - **032**: Outbound SSRF guards (`url-safety` + DNS-pinned `safeOutboundFetch`); automation assign/column + webhook URL checks
  - **033**: Export hard-cap 10k (413); email scheduler batching; rate-limit core unit tests
  - **034**: Sentry dep/warn, docker requires real LLM key, CSP-Report-Only, docs/handoff, env cleanup (GitHub OAuth vars kept)
  - **Review fixes**: IPv6 hex-mapped/loopback/IMDS/CGNAT blocking; calendar fetchNextPage error gate; export blob+toast; epic/sprint Load more
- **Verification**: typecheck 6/6; api unit 170; integration 270; web 37; shared 31; lint+format+build green
- **Next**: operator secrets (METRICS_TOKEN/SENTRY/OAuth); DIR product items if resuming features

### Session — R-24 AI suggest latency (2026-07-15)

- **Goal**: Mitigate remaining material risk R-24 (AI suggest hangs UI on slow LLM)
- **Completed**:
  - `LLMProvider.chat` accepts `timeoutMs` + external `signal`; soft timeouts (<30s) fail fast without retry
  - `suggestAssignee` uses 5s LLM timeout; rule-based fallback returns `fallbackReason: 'timeout' | 'error'`
  - TaskEditModal: elapsed "AI thinking… Ns", Cancel, abort on re-click/close/unmount, pass description, clearer fallback copy
  - RISKS.md: R-24 marked mitigated
- **Verification**: api unit 149; integration 266 (ai.service fallbackReason asserted); web typecheck+lint green
- **Pushed earlier this session**: `1afb937` production readiness
- **Next**: operator secrets only (METRICS_TOKEN/SENTRY/OAuth); product DIR items need maintainer pick

### Session — Production readiness hardening (2026-07-15)

- **Goal**: Feature gap check; if none, production-ready refactor
- **Feature audit**: 68/68 `feature_list.json` entries `passing`; ROADMAP non-cut items P1-1…P4-6 all shipped (P4-7 cut). No unfinished product feature.
- **Completed** (ops/hardening, not a product feature ship):
  - Unified backend env: `packages/env` owns full schema (`APP_URL`, email, Slack/GitLab, `SENTRY_DSN`, `METRICS_TOKEN`); `apps/api/src/shared/lib/env.ts` is thin `safeParse` + process.exit + prod warnings; `prisma.ts` re-exports same `env` (no dual schema).
  - Readiness: `GET /api/ready` probes Postgres + Redis (`checkReadiness`); liveness stays `GET /api/health`.
  - Metrics: optional `Authorization: Bearer ${METRICS_TOKEN}` on `GET /metrics`.
  - Security headers: `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy` on API; nginx static headers aligned.
  - Wire email/app links + workers off `process.env` onto validated `env` (`APP_URL`, `REDIS_URL`, Sentry, Slack signing, GitLab base URL).
  - Docker: api healthcheck → `/api/ready`; email-worker env fixed (`SMTP_PASSWORD`/`EMAIL_FROM` — was mismatched `SMTP_PASS`/`DEFAULT_FROM_*`); `APP_URL`/`METRICS_TOKEN`/`SENTRY_DSN` passed through.
  - `.env.example` documents `APP_URL`, ops tokens, email vars.
  - Tests: unit `health.test.ts` (3) + integration `health.test.ts` (4).
- **Verification** (this session):
  - typecheck: 6/6 green
  - api unit: 149/149
  - api integration: 266/266
  - web unit: 37/37
  - shared unit: 31/31
  - build: 4/4
  - lint + prettier: clean
- **Highest priority unfinished**: none (product). Optional ops: set real `METRICS_TOKEN`/`SENTRY_DSN`/OAuth secrets in deploy env; R-24 AI latency still material UX risk.
- **Next**: operator secrets for prod deploy; or DIR suggestions (CSV import, inbound webhooks, velocity reports) if product work resumes.

### Session — UI/UX improvement: Sprints, Templates, Epics, Calendar (2026-07-12)

- **Goal**: Improve UI/UX of Sprints, Templates, Epics, Calendar pages with shadcn components
- **Completed**:
  - SprintPage full rewrite: Card layout, Progress bars, EmptyState, burndown chart with area fill + grid lines, priority dots, date range display
  - TemplatesPage full rewrite: Card grid, EmptyState, priority dots, recurring rules with active/paused indicator, apply dialog with preview
  - EpicList full rewrite: Card grid, Progress bars, EmptyState, expandable story list with priority dots + status badges, inline add-story
  - CalendarPage full rewrite: shadcn Dialog for modals, shadcn DatePicker for Start/End dates, shadcn Select for Responsible dropdown
  - Prisma migration `20260712180000_calendar_fields`: adds `startDate DateTime?` + `color String?` to Task
  - API task.service.ts: create/update pass startDate + color
  - Shared package: createTaskSchema/updateTaskSchema extended with startDate + color
  - Fixed Calendar Responsible Select: API returns nested `{ user: { id, name } }` — added `select` transform
- **Verification**:
  - `pnpm --filter @flow-desk/web typecheck` → exit 0
  - `pnpm --filter @flow-desk/web lint` → exit 0
- **Files changed**:
  - `apps/web/src/features/sprint/components/SprintPage.tsx`
  - `apps/web/src/features/template/components/TemplatesPage.tsx`
  - `apps/web/src/features/task/components/EpicList.tsx`
  - `apps/web/src/features/calendar/components/CalendarPage.tsx`
  - `apps/api/src/modules/task/task.service.ts`
  - `packages/shared/src/task.ts`
  - `packages/db/prisma/schema.prisma`
  - `packages/db/prisma/migrations/20260712180000_calendar_fields/`

### Session — P4-2 wire-up finish (2026-07-11)

- **Goal**: Land uncommitted P4-2 multi-board glue left from f9d26ec skeptic-gap pass
- **Completed**:
  - Picked up 4 uncommitted files from f9d26ec: `board.routes.ts` (boardId filter on kanban GET /board), `BoardSwitcher.tsx` (default-board useEffect), `pages/board.tsx` (sessionStorage restore + per-board queryKey), `TaskEditModal.tsx` (boardId forwarded on create)
  - Added 1 new integration test: `board-mgmt.test.ts > GET /board partitions tasks by boardId` (mkt 1, eng 1, no-filter 3 incl. boardless)
  - Committed `3baa8c0`: "fix(p4-2): boardId filter on kanban GET /board + default-board + new-task inherits board"
- **Verification** (full gate, no `TEST_DB_PORT` env needed):
  - `pnpm verify` green: typecheck-all + build + unit-tests + integration-tests
  - typecheck turbo: 6/6
  - api unit: 138/138
  - api integration: 244/244 (220 baseline + 24 realtime-chat-refactor + 1 new)
  - web unit: 37/37
  - shared unit: 31/31
  - build: 4/4
  - prettier + eslint + secrets: clean
- **Bonus fix** (commit b99bb98): env-port probe. `pnpm verify` was failing in this dev env because a stray system postgres listens on 5432 (different creds) and `pg_isready` only checks TCP — so `detectDbPort()` returned 5432 and the API prisma singleton (created with that URL in `vitest.integration.config.ts`) failed auth on every request. Fix: shared `tests/setup/db-port.ts` with real `psql` auth probe (verifies both reachability and FlowDesk credentials), consumed by `db.ts` + `global-setup.ts` + `vitest.integration.config.ts`. Now `pnpm verify` works in any env with the FlowDesk docker container running.
- **Highest priority unfinished**: none. ROADMAP non-cut items complete: P1-1 through P4-6 all `passing`. P4-3 upgraded from `blocked` to `passing` in this session — code is end-to-end complete and tested with mocked OAuth providers; only SLACK*\*/FLOWDESK_GITLAB*\* env vars are needed to flip from 501 NOT_CONFIGURED to real 302. P4-7 cut per ROADMAP.
- **Env wired** (commit b694864): 6 vars in `.env` with MOCK*\* prefix as obvious placeholders; `.env.example` documents real var names + redirect URIs. End-to-end smoke: `GET /api/integrations/{slack|gitlab}/status` → `configured: true`; `GET /api/integrations/{slack|gitlab}/connect?workspaceId=…` → 302 to provider authorize URL with correct scope/redirect/state. Replace MOCK*\* values with real secrets from https://api.slack.com/apps and https://gitlab.com/-/user_settings/applications to talk to live providers.

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
- **Standard startup**: `./init.sh` then `docker compose up -d` / `pnpm stack:up`
- **Standard verification**: stage files then `pnpm verify` (or typecheck + unit + integration + build + format:check)
- **Highest priority unfinished**: none product — `feature_list.json` **74** entries `passing` (68 product + **AUD-029…AUD-034** security/ops)
- **Active branch**: `main` @ `4099a0b` (audit 029–034 ship)
- **Plans**: `plans/001`–`034` all **DONE** (`plans/README.md`)
- **Test counts (ship gate)**: api unit **170**, integration **270**, web **37**, shared **31**
- **Prisma**: 7.8.0 | **pnpm**: 11.8.0 | **Node**: 22-alpine
- **Current blocker**: none
- **Key risks**: R-24 **mitigated** (AI suggest timeout/cancel). Residual ops: set real deploy secrets. New mitigated: R-45 chat IDOR, R-46 OAuth 2FA/Slack sign, R-47 outbound SSRF (see RISKS.md)
- **Session 023 (improve audit)**: 39 findings → plans 009–022; Session residual 029–034 + review rounds shipped 2026-07-15
- **Security note**: historical `LLM_API_KEY` exposure in chat — rotate if still in use

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

### Session — Settings CRUD audit (2026-07-12)

- **Goal**: Audit all workspace settings tabs for CRUD completeness
- **Completed**:
  - Audit all 7 settings tabs: General✓ Members✓ Columns✓ Labels✓ Views✓ Automation✓ DangerZone✓
  - Labels: `LabelManagerPage` already exists as embedded tab in workspace-settings.tsx (labels CRUD fully wired)
  - API fix: workspace list now includes `role` per workspace for the current user
- **Fix**: `workspace.repository.ts` — `listWorkspaces`/`listWorkspacesPaginated` now include `members: { where: { userId }, select: { role: true } }` + service maps `members[0]?.role` onto each workspace
- **Verification**: `pnpm verify` — 262/262 tests pass (all suites green)

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

### Session — 2026-07-11 /improve audit

- **Goal**: ROADMAP done; find next batch of high-leverage work
- **Audit**: 4 parallel subagent passes (correctness+security, perf+tests, tech-debt+architecture, DX+docs+direction). Standard depth.
- **Findings**: 32 raw → 25 after dedup → 8 direction suggestions (carried as maintainer options, not plans)
- **Plans written** (commit a9fd245): `plans/023`–`plans/027` covering all 25 findings. 5 independent files in Batch A. Each is self-contained for a fresh-context executor with: in-scope file list, step-by-step verify commands, machine-checkable done criteria, STOP conditions, maintenance notes.
- **What was NOT covered**: bundles (PERF-10/11/12), OpenAPI tooling, PRD/team-vs-portfolio tension, larger ARCH-04 lib/ drift — listed as direction or future-audit items
- **Next**: pick from the 5 plans. All independent, any order works. Plan 024 first if you want plan 027's chat test to reflect the post-024 shape.

### 2026-07-15 22:29 — `1afb937` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-15 22:36 — `e1be8d2` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-15 22:38 — `9673db3` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-15 22:39 — `f78974b` (main)

- **type:** docs
- **msg:** sync session log entries for recent main commits
- **author:** thanhd

### 2026-07-15 22:39 — `dcf691e` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-15 22:40 — `276f623` (main)

- **type:** docs
- **msg:** session log entry for post-commit hook fix
- **author:** thanhd

### 2026-07-15 22:40 — `dd197de` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-18 02:07 — `680b9ca` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-18 02:10 — `c5f6b1c` (main)

- **type:** docs
- **msg:** sync handoff, feature_list, TASKS, RISKS after 029–034 ship
- **author:** thanhd

### 2026-07-18 02:12 — `43382be` (main)

- **type:** docs
- **msg:** make session-handoff shipped table readable
- **author:** thanhd

### 2026-07-18 02:13 — `8599d38` (main)

- **type:** docs
- **msg:** reformat session-handoff with aligned tables
- **author:** thanhd

### 2026-07-18 02:13 — `1fa78f2` (main)

- **type:** docs
- **msg:** point session-handoff tip at latest commit
- **author:** thanhd

### 2026-07-18 02:13 — `8c5b566` (main)

- **type:** docs
- **msg:** sync handoff tip SHA
- **author:** thanhd

### 2026-07-18 02:14 — `6cafb42` (main)

- **type:** docs
- **msg:** avoid stale tip SHA in session-handoff
- **author:** thanhd

### 2026-07-18 02:15 — `723d91a` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-18 02:21 — `308229c` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-18 11:13 — `5d0562d` (main)

- **type:** fix
- **msg:** migrate ECC agents from deprecated tools array to permission block
- **author:** thanhd

### 2026-07-18 17:01 — `9e04ca3` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-18 17:15 — `e802561` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-18 18:00 — `b15c7df` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-18 18:12 — `c76e5d6` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-18 19:28 — `2289289` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-18 19:31 — `ed254ce` (main)

- **type:** style
- **msg:** run prettier to fix formatting in 3 markdown files
- **author:** thanhd

### 2026-07-18 19:35 — `8aff3ab` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-22 20:53 — `f525029` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-22 20:56 — `7bc8dff` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-22 21:05 — `4122146` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-22 21:10 — `815c0b4` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-22 21:10 — `b7acdd8` (main)

- **type:** docs
- **msg:** sync session-handoff after ops deploy ship
- **author:** thanhd

### 2026-07-22 21:20 — `0dd0728` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-22 21:29 — `9bbf66f` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-22 21:33 — `f0a441c` (main)

- **type:**
- **msg:**
- **author:** thanhd

### 2026-07-23 19:58 — `e310e59` (main)

- **type:**
- **msg:**
- **author:** thanhd

### Session — 2026-07-11 plan 023 + plan 024 execution

- **Goal**: Execute audit plans 023 (auth security) and 024 (hot-path perf)
- **Plan 023** (commit 1cd1287):
  - SEC-07: `oauth_state` cookie gains `secure: env.NODE_ENV === 'production'`
  - SEC-01: `CORS_ORIGINS[0]` redirect replaced with `postLoginRedirect()` allowlist helper
  - BUG-04: `assertMembership` now checks `Workspace.deletedAt` (NotFoundError on soft-deleted workspace)
  - SEC-02/BUG-06: register/login use `findFirst` with `deletedAt` filter (soft-deleted email → 409, not 500)
  - Regression tests: 2 in auth-2fa (soft-deleted register 409, soft-deleted login 401), 1 in soft-delete (workspace soft-delete → assertMembership 404)
- **Plan 024** (commit 3e3af7f):
  - PERF-02: chat channel list uses `DISTINCT ON` raw SQL (was N subqueries)
  - PERF-03: sprint list uses `groupBy` (was N aggregates)
  - PERF-04: board endpoint exposes `taskCount` per column
  - PERF-05: board query gated on `boardId` (avoids double-fetch)
  - PERF-06: composite index `(workspaceId, deletedAt, position)` + `(columnId, position)` on Task
  - PERF-07: `suggestAssignee` cached in Redis 5min TTL
  - PERF-08: webhook fan-out uses `addBulk` (was N adds)
  - PERF-09: chat sendMessage returns notifications from tx scope
- **Verification**: `pnpm verify` green (typecheck + unit + integration 253/253 + build)
- **Plan 025** (commit 7fdbd00):
  - ARCH-01: dropped dead safeEmit wrapper (25 call sites → direct emit; chat module 4 sites → inline try/catch)
  - ARCH-02a: extracted recordUpdateDiff → activity/activity-diff.ts
  - ARCH-02b: extracted handleAssigneeChange → task/task-assignee.ts
  - ARCH-02c: extracted CSV helpers → task/task-csv.ts
  - task.service.ts: 704 → 475 lines (-32%)
- **Plan 026** (commit 507a1d5):
  - DX-01: .editorconfig added
  - DX-03: pnpm guardrails secrets wired into lefthook pre-commit
  - DX-04: api-key Zod schemas extracted to @flow-desk/shared/api-key
  - TASKS-01: TASKS.md marked historical (frozen Sprint 20)
  - DX-02: stale test counts replaced with 'run pnpm verify'
- **Plan 027** (commit 8bba5bd):
  - TEST-08: MAX_BACKUP_CODES=16 cap + 2 unit tests
  - TEST-01: 5 new 2FA integration tests (backup reuse, wrong TOTP, refresh replay, full flow, backup challenge)
  - TEST-02: 2 new automation action tests (set-field, move-column)
  - TEST-05: sprint burndown route shape + data assertion
  - TEST-07: chat channel latestMessage per-channel accuracy
- **Final verification**: pnpm verify green (typecheck + unit + integration 262/262 + build)
- **All 5 audit plans complete**: 023, 024, 025, 026, 027 all DONE
