# Tasks (historical — frozen 2026-07-05, end of Sprint 20)

> Active backlog lives in `feature_list.json` (last updated **2026-07-15**).
> This file is preserved for sprint history. **Appendix only** after freeze: security/ops audit rows below.

## Appendix — Security/ops audit 029–034 (2026-07-15, post-freeze)

Not a product ROADMAP sprint. Tracked in `feature_list.json` as `AUD-029`…`AUD-034` (all **passing**). Shipped commit `4099a0b`.

| Story       | Scope                                                                      | Status  |
| ----------- | -------------------------------------------------------------------------- | ------- |
| **AUD-029** | Chat membership always; typing join-gate; Secure integration OAuth cookies | passing |
| **AUD-030** | Google OAuth 2FA httpOnly cookie; Slack HMAC; callback cookie workspaceId  | passing |
| **AUD-031** | Task `sprintId`/`type` filters; list/calendar/epic/sprint pagination       | passing |
| **AUD-032** | Outbound SSRF + DNS-pinned fetch; automation target checks                 | passing |
| **AUD-033** | Export 10k/413; email scheduler batch; rate-limit unit tests               | passing |
| **AUD-034** | Sentry package, docker LLM required, CSP-RO, docs/handoff                  | passing |

Review follow-ups (same ship): IPv6 mapped/IMDS/CGNAT blocklist, calendar next-page error gate, export blob+toast, epic/sprint Load more.

---

## Sprint 1: Foundation (Days 1-5)

## Sprint 1: Foundation (Days 1-5)

### Epic: Project Setup

| Story                         | Tasks                                                                                                                           | Estimate | Status  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- |
| **setup-001**: Monorepo       | Create pnpm-workspace.yaml, turbo.json, root package.json, apps/web, apps/api, packages/shared directories + package.json files | 1d       | passing |
| **setup-002**: Tailwind v4    | Install Tailwind v4, configure design tokens, create globals.css, shadcn/ui init                                                | 1d       | passing |
| **setup-003**: Prisma schema  | Install Prisma, write schema.prisma with all entities, run prisma generate                                                      | 1d       | passing |
| **setup-004**: Docker Compose | Write docker-compose.yml, Dockerfiles for api + web, .env.example                                                               | 1d       | passing |
| **setup-005**: Shared package | Export Zod schemas for User, Task, Workspace, Comment, Auth                                                                     | 1d       | passing |

## Sprint 2: Authentication (Days 6-8)

### Epic: User Auth

| Story                              | Tasks                                                                                                                       | Estimate | Status  |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------- | ------- |
| **auth-001**: Email/password + JWT | bcrypt password hash, register/login endpoints, JWT issue/verify, httpOnly cookie set, /me endpoint, refresh token rotation | 2d       | passing |
| **auth-002**: Google OAuth         | OAuth flow with passport-google or manual, link account, return JWT                                                         | 1d       | blocked |

## Sprint 3: Workspaces (Days 9-11)

### Epic: Multi-tenant Workspaces

| Story                          | Tasks                                                                           | Estimate | Status  |
| ------------------------------ | ------------------------------------------------------------------------------- | -------- | ------- |
| **workspace-001**: CRUD        | POST/GET/PATCH/DELETE /workspaces, create default columns on creation           | 1.5d     | passing |
| **workspace-002**: Members     | POST/GET/PATCH/DELETE /workspaces/:id/members, role-based permission middleware | 1.5d     | passing |
| **workspace-003**: Settings UI | Tabbed page (General / Members / Columns / Danger zone) with role-gated actions | 1.5d     | passing |

## Sprint 4: Task Management (Days 12-18)

### Epic: Tasks

| Story                                                                    | Tasks                                                                                                                                                                | Estimate | Status  |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- |
| **task-001**: Task CRUD                                                  | POST/GET/PATCH/DELETE /tasks, query filters (status, assignee, priority, dueDate)                                                                                    | 2d       | passing |
| **task-002**: Kanban board                                               | Board page, column components, drag-drop with dnd-kit, status update on drop                                                                                         | 2d       | passing |
| **task-003**: List/Table view                                            | Table component, column sort, filter UI, URL state sync                                                                                                              | 1.5d     | passing |
| **task-004**: Subtasks + deps                                            | Subtask CRUD, dependency create/delete, circular detection                                                                                                           | 1.5d     | passing |
| **kanban-bugs-fix**: B1 New task no-op + B2 drag-drop position not saved | Wire "New task" button → modal → POST /api/tasks with optimistic create; send {columnId, position, version} on move; server splice + renumber in prisma.$transaction | 0.5d     | passing |

## Sprint 5: Collaboration (Days 19-25)

### Epic: Real-time + Comments

| Story                         | Tasks                                                                                   | Estimate | Status  |
| ----------------------------- | --------------------------------------------------------------------------------------- | -------- | ------- |
| **collab-001**: Socket.IO     | Server setup with Redis adapter, JWT auth middleware, /tasks namespace, room join/leave | 2d       | passing |
| **collab-002**: Comments      | Comment CRUD, @mention extraction, autocomplete UI, notification trigger                | 2d       | passing |
| **collab-003**: Notifications | Notification model, real-time delivery, badge count, mark-as-read                       | 2d       | passing |

## Sprint 6: AI Features (Days 26-30)

### Epic: AI

| Story                              | Tasks                                                                                          | Estimate | Status  |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- | -------- | ------- |
| **ai-001**: Assignment suggestions | LLMProvider class, service to rank members by workload + history, return top 3                 | 2.5d     | passing |
| **ai-002**: Auto-scheduling        | Constraint solver (deps + deadlines + capacity), LLM-assisted date estimation, return schedule | 2.5d     | passing |

## Sprint 7: Polish (Days 31-33)

### Epic: Production Ready

| Story                          | Tasks                                                                         | Estimate | Status  |
| ------------------------------ | ----------------------------------------------------------------------------- | -------- | ------- |
| **file-001**: File attachments | Multer/multipart upload, local storage in docker volume, thumbnail generation | 1.5d     | passing |
| **file-002**: Seed data        | seed.ts with 5 users, 3 workspaces, 50+ tasks, 30+ comments                   | 1d       | passing |

## Sprint 8: Security Hardening (Day 34)

### Epic: Close P0 Security Gaps

| Story                                                               | Tasks                                                                                                                                                                                                                                                                                                                                                                      | Estimate | Status  |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- |
| **security-001**: Rate limiting on auth/AI/write paths              | Redis INCR+EXPIRE sliding-window middleware (`shared/middleware/rate-limit.ts`); auth:register 3/h/ip, auth:login 5/min/ip, auth:refresh 30/min/ip, AI 5/min/user, broad write 60/min/user; X-RateLimit-\* headers; RateLimitError with Retry-After                                                                                                                        | 0.5d     | passing |
| **security-002**: Socket.IO server-side emissions                   | `shared/lib/socket-events.ts` singleton + `setIo(io)` + `emitToRoom/Namespace/User/Workspace/Task` over FlowDeskNamespace = `/tasks \| /notifications \| /collab`; task routes emit `task:created/updated/deleted/moved/subtask:created/dependency:added`; comment routes emit `comment:created/updated/deleted`; notification emit `notification:new` to `user:{id}` room | 0.5d     | passing |
| **security-003**: Attachment IDOR closed + membership gaps fixed    | `shared/lib/access.ts` `assertMembership(workspaceId, userId)`; applied to attachment POST/GET?taskId=/:id/download, task POST/PATCH/DELETE/move/subtasks/deps, comment POST/PATCH/DELETE, AI suggest-assignee/auto-schedule                                                                                                                                               | 0.5d     | passing |
| **security-004**: Membership checks on POST /comments and AI routes | Same `assertMembership` helper; AI routes additionally rate-limited 5/min/user                                                                                                                                                                                                                                                                                             | 0.25d    | passing |
| **security-005**: bcrypt cost 10 + LLM provider hardening           | bcrypt 12 → 10 in `auth.routes.ts`; `LLMError extends AppError(502, 'LLM_UPSTREAM')`; AbortController 30s timeout + 1 retry on 5xx/AbortError with 500ms backoff; error-handler status cast widened to `400\|401\|403\|404\|409\|429\|502\|503`                                                                                                                            | 0.25d    | passing |

## Sprint 9: Kanban Polish (Session 011)

### Epic: F2 — Jira-clone parity pass

| Story                                                                                                          | Tasks                       | Estimate | Status  |
| -------------------------------------------------------------------------------------------------------------- | --------------------------- | -------- | ------- |
| **F2.labels-be**: Label Zod schema + repo + service + cache + routes + typed socket events                     | Epic 4 (6 tasks, full code) | 1.5d     | passing |
| **F2.task-label-assign-be**: TaskLabelAssignment repo + service (dual-write to Task.labelsDeprecated) + routes | Epic 5 (3 tasks)            | 0.5d     | passing |
| **F2.workspace-be**: Workspace service/repo extraction + member invite endpoint + role change                  | Epic 6 (3 tasks)            | 1d       | passing |
| **F2.fe-foundation**: type-safe api client + TanStack Query + shadcn primitives + auth guard                   | Epic 7 (3 tasks)            | 0.5d     | passing |
| **F2.workspace-ui**: switcher + settings page + members tab + invite modal                                     | Epic 8 (4 tasks)            | 1d       | passing |
| **F2.label-ui**: manager page + chip component + task-card label select (Radix Popover)                        | Epic 9 (3 tasks)            | 1d       | passing |
| **F2.welcome**: onboarding wizard + empty board state                                                          | Epic 10 (2 tasks)           | 0.5d     | passing |
| **F2.realtime**: socket reconnection + optimistic reconciliation + presence UI                                 | Epic 11 (3 tasks)           | 1d       | passing |
| **F2.e2e**: Playwright config + fixtures + critical-path + realtime specs                                      | Epic 12 (3 tasks)           | 0.5d     | passing |

## Sprint 10-13: Backend Hardening + Realtime Polish (Session 012)

### Epic: F3-F6 — close R-29 / R-30 / R-31 / R-32 / R-34

| Story                                                                                    | Tasks                                                                                          | Estimate | Status  |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------- | ------- |
| **F3.r29-soft-delete**: 12 mutation-path gaps audited + Prisma softDelete extension      | Audit + add filters + extension + 15 tests                                                     | 1d       | passing |
| **F4.r30-cursor-pagination**: cursor/limit on 7 list endpoints + shared envelope         | packages/shared/pagination.ts + 7 routes + 12 tests                                            | 1d       | passing |
| **F5.r31-r32-service-repo-tests**: split task/comment/notification/attachment/ai + tests | 5 modules × (repo+service+routes slim) + 73 tests + topologicalSort bug fix                    | 2d       | passing |
| **F6.r34-presence-drag-overlay**: server presence gateway + DragOverlay real-card clone  | realtime.gateway.ts + Redis-backed presence (30s TTL, 10s sweeper) + Kanban renderOverlay prop | 1d       | passing |

## Sprint 14: Chat + Notifications + Email (Session 016)

### Epic: F7 — real-time chat + email notifications

| Story                                                                | Tasks                                                                                  | Estimate | Status  |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------- | ------- |
| **F7.chat-be**: ChatChannel + ChatMessage models + API + task chat   | Prisma schema (5 models), Zod schemas, chat channel+message routes, task-level chat    | 2d       | passing |
| **F7.notifications-be**: Email provider + templates + BullMQ workers | nodemailer+resend, 6 email templates, BullMQ queue + instant/delayed/digest processors | 2d       | passing |
| **F7.notification-prefs-be**: Workspace + user notification settings | WorkspaceNotificationSetting + UserNotificationPreference models, preference routes    | 1d       | passing |
| **F7.chat-fe**: Chat sidebar + channel view + TaskChat component     | Frontend chat UI (sidebar, channel view, message bubbles, task-level chat)             | 1.5d     | passing |
| **F7.realtime-fe**: Notification bell + real-time delivery           | useNotificationsRealtime hook, bell badge, Socket.IO /notifications namespace          | 0.5d     | passing |

## Sprint 15: Workspace CRUD + Kanban Polish (Session 018)

### Epic: F8 — dashboard create + kanban column kebab

| Story                                                    | Tasks                                                                                     | Estimate | Status  |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------- | ------- |
| **F8.dashboard-create**: Create workspace from dashboard | useCreateWorkspace hook + WorkspaceCreateDialog + dashboard wiring                        | 0.5d     | passing |
| **F8.kanban-polish**: Column kebab menu + keyboard a11y  | DropdownMenu (Add task, Rename column), accessibility announcements, DropAnimation tuning | 0.5d     | passing |

## Sprint 16: Kanban Sprint 1 — a11y + click-bubble + sensor (Session 021)

### Epic: Kanban UX audit fixes

| Story                              | Tasks                                                                            | Estimate | Status  |
| ---------------------------------- | -------------------------------------------------------------------------------- | -------- | ------- |
| **kanban-rc1**: Click bubbling fix | INTERACTIVE_SELECTOR constant + NoCardClick wrapper in kanban.tsx                | 0.25d    | passing |
| **kanban-rc2**: PointerSensor lag  | distance:8 no delay + TouchSensor {delay:150, tolerance:8}                       | 0.25d    | passing |
| **kanban-rc4**: Nested role=button | Attributes on inner div + aria-roledescription on article, removed role='button' | 0.25d    | passing |

## Sprint 17: Kanban Sprint 1.5 — race + overlay (Session 022)

### Epic: Kanban remaining audit fixes

| Story                                   | Tasks                                                                                | Estimate | Status  |
| --------------------------------------- | ------------------------------------------------------------------------------------ | -------- | ------- |
| **kanban-rc3**: Optimistic reorder race | move-progress flag + useRealtime skip-when-dragging                                  | 0.25d    | passing |
| **kanban-rc5**: Same-position move      | Early-return in handleMove when fromColumnId === toColumnId && fromIndex === toIndex | 0.1d     | passing |
| **kanban-rc6**: DragOverlay fade        | opacity-30 + transition-opacity duration-150 on dragging card                        | 0.1d     | passing |

## Sprint 18: Audit Batch (Sessions 023-024)

### Epic: Security + Performance + Correctness + Tech Debt

| Story                                 | Tasks                                                    | Estimate | Status  |
| ------------------------------------- | -------------------------------------------------------- | -------- | ------- |
| **audit-009**: Email worker bugs      | Per-task dedup, BullMQ cancel, PENDING status fix        | 0.25d    | passing |
| **audit-010**: Security hardening     | Extension allowlist, security headers, rate-limit IP fix | 0.25d    | passing |
| **audit-011**: Vite prod config       | Vite production build optimizations                      | 0.1d     | passing |
| **audit-012**: Board over-fetch       | Board endpoint query optimization                        | 0.1d     | passing |
| **audit-013**: Tech debt dedup        | safeEmit/task helper deduplication                       | 0.25d    | passing |
| **audit-014**: Enum casts             | Prisma enum `as any` cast cleanup                        | 0.1d     | passing |
| **audit-015**: Chat uniqueness        | Chat channel unique constraint fix                       | 0.1d     | passing |
| **audit-016**: Auth caching           | Auth + membership caching                                | 0.5d     | passing |
| **audit-017**: Code splitting         | Code splitting + lazy loading                            | 0.5d     | passing |
| **audit-018**: API validation         | API client response validation                           | 0.5d     | passing |
| **audit-019**: Register transactional | Register/OAuth transactional operations                  | 0.5d     | passing |
| **audit-020**: Test pipeline CI       | CI unit tests job                                        | 0.25d    | passing |
| **audit-021**: E2E realtime           | E2E realtime test                                        | 0.5d     | passing |
| **audit-022**: Realtime gateway tests | Realtime gateway unit tests                              | 1d       | passing |

## Sprint 19: Global Search (Session 026)

### Epic: Full-text search across tasks, comments, and attachments

| Story                            | Tasks                                                                                                                   | Estimate | Status  |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------- | ------- |
| **P1-1**: Global search API + UI | tsvector indexes, search SQL, search service, search routes, search palette (Cmd+K), hooks, 8 integration + 4 web tests | 1d       | passing |

## Sprint 20: Saved Views/Filters (Session 027)

### Epic: Save, load, and manage filter presets per workspace

| Story                      | Tasks                                                                                                                                                          | Estimate | Status  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- |
| **P1-2**: Saved views CRUD | SavedFilter migration, shared schemas, repository, service, routes, 9 integration tests, web feature module, SavedViewsBar + SavedViewsManager UI, 5 web tests | 1d       | passing |
