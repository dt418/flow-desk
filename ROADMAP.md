# ROADMAP — FlowDesk Feature Rollout

Sequenced plan for closing the Jira/Trello parity gap. Driven by the brainstorming session on 2026-07-05 (audience = D: portfolio + eventual small-team use; search = A: Postgres tsvector; future-sprint = A: careful avoidance, no speculative schema).

Items are feature-list-schema-compatible. `/plan-feature` pulls one unstarted item at a time and runs brainstorm → approve → plan → approve → execute → update `feature_list.json`.

## Cross-cutting policies (apply to every item)

- **Web test coverage grows per-feature.** Every frontend change ships its component test using the F8 pattern (`apps/web/src/components/ui/workspace-create-dialog.test.tsx` is the template: RHF + zodResolver + QueryClientProvider + MemoryRouter + mocked `@/lib/api`). No separate "web test sprint" — coverage scales with features.
- **Future-Sprint Schema Hygiene** (AGENTS.md §Future-Sprint Schema Hygiene, RISKS.md R-42): no `board` in names, structural fields limited to `Task.columnId` + `Task.parentTaskId`, filter-by-parameter signatures, Epic via `parentTaskId` reuse, Sprint+estimation deferred together, migrations stay additive. Every query this phase must pass the checklist.
- **Caveman auto-toggle** (AGENTS.md §Caveman Auto-Toggle): full verbosity for brainstorm/design, caveman for plan/execute output, normal verbosity for commits/PR/handoff artifacts.
- **One feature `in_progress` at a time** in `feature_list.json` (AGENTS.md working rule).

## Already shipped (not re-planned)

- Activity log (`db9615a` — `TaskActivity` model, `ActivityAction` enum, `/api/tasks/:id/activity`, `ActivityTimeline` tab). Feeds Phase 2 automation + Phase 1 webhooks.
- Email infra (F7 — BullMQ + Nodemailer/Resend + per-user prefs + digest). Phase 2 expands _event coverage_, not infra.
- Lint + web test scaffolding (`qa-001`, refreshed 2026-07-04 — real eslint/vitest, 130 warnings cleaned, lefthook + CI guardrails, 3 web test files / 10 tests passing).
- **P1-1 Global search** (session 026 — tsvector + GIN + CROSS JOIN LATERAL + Cmd+K palette + 8 integration + 4 web tests).
- **P1-2 Saved views/filters** (session 027 — SavedFilter CRUD + SavedViewsBar + SavedViewsManager + 9 integration + 5 web tests; fixed R-43 softDeleteExtension drift).

---

## Phase 1 — Daily-use gaps (zero new containers, one cheap Postgres spike)

Front-loads portfolio artifacts a reviewer can try in 2 minutes each. No `Board`/`Epic`/`Sprint` models touched (schema-hygiene checklist respected). Total ~4.5d.

### P1-1 — Global search (tsvector + GIN) ✅ shipped

- **priority**: 90
- **dependencies**: none
- **scope**:
  - Add `searchVector tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,''))) STORED` on `Task`; GIN index. Same on `Comment.body` and `Attachment.filename` (raw SQL migration — Prisma can't model stored generated columns; mark `@map` + read-only comment, never write).
  - `GET /api/search?q=&workspaceId=&limit=` across tasks/comments/attachments, ranked by `ts_rank`, cursor-paginated (reuse `packages/shared/pagination.ts`).
  - Global search bar in `AppShell` (Cmd/Ctrl+K), results dropdown, jump-to-task.
  - Scope: workspace membership enforced via `assertMembership`.
- **rough effort**: 1d
- **acceptance seed**: search "report" returns tasks with "report" in title/description + comments mentioning it; cross-workspace results rejected for non-members.

### P1-2 — Saved views / filters ✅ shipped

- **priority**: 89
- **dependencies**: none
- **scope**:
  - `SavedFilter` model (id, userId, workspaceId, name, query Json, isShared Boolean, createdAt, updatedAt, deletedAt; `@@index [workspaceId, userId]`).
  - CRUD `GET/POST/PATCH/DELETE /api/workspaces/:id/saved-filters`; `isShared` visible to workspace members, edit owner-only.
  - `query` JSON shape = existing list filter object (`status`, `priority`, `assigneeId`, `dueDate`, `sortBy`, `sortOrder`) — Zod schema in `packages/shared`.
  - Web: save-current-filter button on list page, named dropdown to load, manage dialog.
- **rough effort**: 1d
- **acceptance seed**: filter list by status=IN_REVIEW + priority=HIGH → save as "Hot queue" → reload page → load "Hot queue" → filters restored.

### P1-3 — CSV export

- **priority**: 88
- **dependencies**: none
- **scope**:
  - `GET /api/workspaces/:id/tasks/export?format=csv&<filters>` streams CSV (status, title, assignee email, priority, dueDate, labels). Same filter signature as list endpoint.
  - Web: "Export CSV" button on list page + saved-filter row.
  - Streaming response (`Content-Disposition: attachment`), no in-memory build for large workspaces.
- **rough effort**: 0.5d
- **acceptance seed**: export Demo workspace → CSV opens in Excel/Numbers with 51 task rows + correct headers.

### P1-4 — Outgoing webhooks

- **priority**: 87
- **dependencies**: none (reuses shipped `TaskActivity` event stream)
- **scope**:
  - `Webhook` model (id, workspaceId, url, secret, events String[] (subset of `ActivityAction`), isActive, createdAt, updatedAt, deletedAt; `@@index [workspaceId, isActive]`).
  - `WebhookDelivery` model (id, webhookId, activityId, status, attemptCount, responseCode, deliveredAt) — for retry + audit.
  - BullMQ queue subscribes to `activityService.record()` emissions; HMAC-SHA256 body signing with `secret`.
  - CRUD `POST/GET/PATCH/DELETE /api/workspaces/:id/webhooks` (Admin+ role).
  - Web: settings → Webhooks tab (URL, event checkboxes, secret reveal, delivery log).
- **rough effort**: 1d
- **acceptance seed**: register webhook for `TASK_UPDATED` on Demo workspace → update a task → webhook receives signed POST within 2s; delivery log shows 200.

### P1-5 — 2FA (TOTP)

- **priority**: 86
- **dependencies**: none
- **scope**:
  - `User.twoFactorEnabled Boolean`, `twoFactorSecret String?` (encrypted at rest), `twoFactorBackupCodes String[]` (bcrypt-hashed).
  - `otplib` + QR code generation (`qrcode` lib). Endpoints: `POST /api/auth/2fa/setup` (returns QR + secret), `POST /api/auth/2fa/verify` (enables after code), `POST /api/auth/2fa/disable` (requires current code), backup-code generation + consumption.
  - Login flow: after password check, if `twoFactorEnabled` → return `{twoFactorRequired: true}` → `POST /api/auth/login/2fa` with TOTP/backup code.
  - Web: 2FA setup page (QR + verify), backup codes one-time display, disable flow, login second-step screen.
- **rough effort**: 1d
- **acceptance seed**: enable 2FA → logout → login with password → prompted for TOTP → enter code → JWT cookie set; backup code works once then rejected.

---

## Phase 2 — Automation + email coverage + observability (builds on Phase 1)

Automation inputs now exist (TaskActivity + webhooks). Email infra already shipped in F7; this expands event coverage. Total ~5-6d.

### P2-1 — Automation rules engine

- **priority**: 85
- **dependencies**: P1-4 (webhooks — same event-subscription pattern), activity-log (shipped)
- **scope**:
  - `Rule` model (id, workspaceId, name, trigger `ActivityAction`, condition Json (field/op/value DSL), action Json (set-field / assign / move-column / send-webhook / send-email), isActive, createdAt, updatedAt, deletedAt).
  - `RuleExecution` model (id, ruleId, activityId, status, error?, executedAt) — audit + retry.
  - Executor subscribes to `TaskActivity` inserts; evaluates conditions; runs actions in BullMQ worker.
  - CRUD `POST/GET/PATCH/DELETE /api/workspaces/:id/rules` (Admin+).
  - Web: rules builder UI (trigger dropdown, condition rows, action rows), execution log.
- **rough effort**: 3-4d (biggest item)
- **acceptance seed**: rule "when status→IN_REVIEW, assign to workspace Owner" → move task to In Review → owner assigned, execution log shows success.

### P2-2 — Email event coverage expansion

- **priority**: 84
- **dependencies**: F7 email infra (shipped)
- **scope**:
  - New templates: `mention` (comment @mention), `due-soon` (24h reminder), `status-change` (on task moved), `assignment-change` (reuses F7 `task-assigned` pattern for un-assign).
  - Wire each event through `notification-email.service.ts` → BullMQ instant/delayed processors (F7 pattern).
  - Respect `UserNotificationPreference` per-event toggles (F7 model already supports this).
- **rough effort**: 1d
- **acceptance seed**: @mention user with email prefs on → receives email within 30s; due-soon task triggers reminder at configured offset.

### P2-3 — Observability (Sentry + metrics)

- **priority**: 83
- **dependencies**: none
- **scope**:
  - Sentry SDK on API (`@sentry/node`) + web (`@sentry/react`); DSN from env, disabled if unset.
  - Metrics: Prometheus `/metrics` endpoint on API (request count, latency histogram, LLM latency, BullMQ queue depth, Socket.IO connection count) via `prom-client`.
  - Structured logging already exists — add `requestId` propagation to all log entries (verify, not rebuild).
- **rough effort**: 1d
- **acceptance seed**: trigger an LLM error → Sentry captures it; `/metrics` returns prometheus format with `http_requests_total` + `llm_latency_seconds_bucket`.

---

## Phase 3 — PM semantics (schema grows, additive only)

Sprint cluster ships together (estimation without sprint UI = useless). Total ~7-8d.

### P3-1 — Estimation + sprint + burndown

- **priority**: 82
- **dependencies**: none (additive schema, checklist-respecting)
- **scope**:
  - `Task.estimate Int?` (story points) + `Task.sprintId String?` (nullable FK).
  - `Sprint` model (id, workspaceId, name, goal, startDate, endDate, status (PLANNED/ACTIVE/CLOSED), createdAt, updatedAt, deletedAt; `@@index [workspaceId, status]`).
  - Backlog view: unassigned-to-sprint tasks; sprint planning: drag tasks into sprint; sprint start/close; burndown chart (remaining points per day).
  - CRUD `POST/GET/PATCH/DELETE /api/workspaces/:id/sprints` + `POST /api/sprints/:id/tasks/:taskId` (assign/unassign).
  - Web: backlog + sprint board toggle, sprint planning drag-drop, burndown chart (lightweight SVG or recharts).
- **rough effort**: 4-5d
- **acceptance seed**: create sprint → drag 5 tasks in (total 21 pts) → start sprint → close sprint → burndown shows ideal vs actual line.

### P3-2 — Recurring tasks / templates

- **priority**: 81
- **dependencies**: none
- **scope**:
  - `TaskTemplate` model (id, workspaceId, name, fields Json, createdAt, updatedAt, deletedAt).
  - `RecurringRule` model (id, templateId, cron String, nextRunAt, lastRunAt, isActive, createdAt, updatedAt).
  - BullMQ scheduler creates tasks from templates on cron; `nextRunAt` advances after each run.
  - CRUD for templates + recurring rules; web: template manager, recurring-rule editor.
- **rough effort**: 2d
- **acceptance seed**: template "Weekly status writeup" + cron every Monday 09:00 → task created automatically on next Monday.

### P3-3 — Calendar view

- **priority**: 80
- **dependencies**: none
- **scope**:
  - Pure UI over existing `Task.dueDate` — no schema change.
  - `/workspaces/:id/calendar` page: month grid, tasks on due date, click-to-open, drag-to-reschedule (updates `dueDate`).
  - Filter by assignee/label (reuse saved filters from P1-2).
- **rough effort**: 1d
- **acceptance seed**: 3 tasks with due dates this week → visible on calendar → drag one to next week → `dueDate` updates, board reflects new date.

---

## Phase 4 — Scale-out / integrations / polish (heaviest, last)

Includes the schema-hygiene payoff: `Board` model lands here, after every checklist-respecting query is already in place. Total ~12-15d; items can be reordered or dropped.

### P4-1 — Epic → Story hierarchy

- **priority**: 79
- **dependencies**: none (uses existing `Task.parentTaskId` self-ref)
- **scope**:
  - No new model — add `Task.type` discriminator (`TASK` | `EPIC` | `STORY` | `SUBTASK`); Epic→Story→Subtask = `parentTaskId` depth.
  - Epic list view; story nesting under epic; subtask nesting under story (existing UI generalizes).
  - Web: epic lane on board, collapse/expand story tree.
- **rough effort**: 2d

### P4-2 — Multiple boards per workspace

- **priority**: 78
- **dependencies**: P4-1 (or standalone — heaviest migration in the roadmap)
- **scope**:
  - `Board` model (id, workspaceId, name, position, createdAt, updatedAt, deletedAt; `@@index [workspaceId]`).
  - `Task.boardId String?` (nullable — existing tasks default to workspace's first board).
  - Rename nothing (checklist: queries already use `getColumnsByWorkspace` — add `boardId` as an optional filter arg, never a hardcoded scope).
  - Web: board switcher in workspace header, create-board dialog.
- **rough effort**: 2-3d
- **acceptance seed**: create "Marketing" + "Engineering" boards in one workspace → tasks partition correctly → switch boards → board persists.

### P4-3 — Slack + GitLab OAuth integrations

- **priority**: 77
- **dependencies**: P1-4 (webhooks — integration = webhook + incoming OAuth)
- **scope**:
  - Slack: slash-command endpoint, OAuth connect, channel-webhook wizard.
  - GitLab: OAuth (reuse Google OAuth pattern from `auth.routes.ts`), issue-linking (task ↔ GitLab issue URL), MR-status badges on task.
  - Per-provider creds in `.env` (`SLACK_CLIENT_*`, `FLOWDESK_GITLAB_*`); never committed.
- **rough effort**: 2d

### P4-4 — Public API + API keys

- **priority**: 76
- **dependencies**: none
- **scope**:
  - `ApiKey` model (id, userId, name, hashedKey, lastUsedAt, scopes String[], createdAt, revokedAt).
  - Auth middleware: `Authorization: Bearer fdkey_...` → lookup → user context (separate from JWT cookie auth).
  - Separate rate-limit tier (stricter than cookie auth: 100/min/key).
  - `GET /api/v1/...` public routes (read-heavy: tasks, workspaces, comments); write routes scoped by key `scopes`.
  - Web: API keys settings page (create, reveal-once, revoke, last-used).
- **rough effort**: 2d

### P4-5 — PDF / Excel export

- **priority**: 75
- **dependencies**: P1-3 (CSV export — extends export module)
- **scope**:
  - PDF: task detail report (per-task) + workspace summary. Excel: full task list with multiple sheets (tasks, comments, attachments).
  - Streaming where possible; cap row count for PDF.
- **rough effort**: 1d

### P4-6 — WCAG compliance pass

- **priority**: 74
- **dependencies**: none (audit + remediation)
- **scope**:
  - axe-core automated scan on every page; manual keyboard-nav audit; screen-reader pass (NVDA + VoiceOver).
  - Remediation tickets per finding; verify with `web-quality-audit` skill.
- **rough effort**: 2d

### P4-7 — ~~Timeline / Gantt + swimlanes~~ (CUT)

- **status**: cut from roadmap
- **reason**: PRD Non-Goal ("Phase 2"), and Q1 audience = D (portfolio + small-team, no scrum-team user pressure). Gantt implies multi-week project timelines across dependent tasks — scrum/PM-team territory Q1 explicitly deprioritized. Calendar view (P3-3) covers the "see my tasks over time" need.
- **if revisited later**: goes through a fresh brainstorm, not a lingering optional line here.

---

## Sequencing rationale

- **Phase 1 cheap-first** (D): search/saved-views/CSV/2FA = visible portfolio artifacts in 2 min each; webhooks = integration glue + automation enabler. Zero new containers.
- **Phase 2 builds on Phase 1**: automation engine subscribes to activity-log (shipped) + reuses webhook event pattern (P1-4). Email infra already shipped — coverage expands, not rebuilt.
- **Phase 3 schema grows but stays additive**: sprint+estimation together (one without the other = broken), recurring/templates, calendar (no schema change).
- **Phase 4 last**: heaviest migrations (`Board`/`Task.boardId`) land after every checklist-respecting query is in place; integrations/API/WCAG/polish. Gantt flagged optional per PRD non-goal.

## Rejected alternatives

- **#2 Automation-first**: front-loads rules engine before search/saved-views. Rejected — webhooks (automation input) land in Phase 1 anyway, so #2's only real difference is reordering a heavier 3-4d item earlier with no cheap-set companion. Risks clever-but-annoying-for-daily-use.
- **#3 Search-first minimal**: Phase 1 = search + saved-views only, everything else pushed right. Rejected — leaves webhooks/2FA/CSV (all cheap, ~2.5d total) sitting idle. False economy; smallest phase 1 isn't cheapest-unlocks-most.

---

## Risk register additions (P1-2)

| ID              | Risk                                                                                                                                                                                          | Likelihood | Impact | Mitigation                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ | -------------------------------------------------------------------------------------------------------- |
| R-43 (resolved) | **softDeleteExtension drift** — packages/db copy missing models vs apps/api copy; module prisma doesn't soft-delete-filter affected models                                                    | High       | High   | Synced packages/db/src/prisma-extension.ts to match apps/api copy (commit 12c6f6f); pre-existing from F7 |
| R-44            | **Partial unique index not in Prisma schema** — SavedFilter name uniqueness requires raw SQL `CREATE UNIQUE INDEX ... WHERE deletedAt IS NULL`; Prisma @@unique can't express partial indexes | Medium     | Low    | Manual migration SQL; schema.prisma can't validate; future resets must use `migrate deploy`              |
