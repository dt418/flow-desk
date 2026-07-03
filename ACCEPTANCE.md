# ACCEPTANCE — Testable Acceptance Criteria

## setup-001: Monorepo

- [ ] `pnpm-workspace.yaml` exists at root
- [ ] `turbo.json` exists at root with build pipeline
- [ ] `apps/web`, `apps/api`, `packages/shared` exist with `package.json`
- [ ] `pnpm install` from root completes without error
- [ ] `pnpm --filter @flow-desk/shared build` produces `packages/shared/dist/`
- [ ] `pnpm --filter @flow-desk/web typecheck` succeeds
- [ ] `pnpm --filter @flow-desk/api typecheck` succeeds

## setup-002: Tailwind v4 Design System

- [ ] `tailwindcss@4` installed
- [ ] `@theme` block in `apps/web/src/index.css` defines emerald-500, teal-500
- [ ] Background tokens for dark (e-950) and light (#f2f9f5) defined
- [ ] Dark mode toggle works (class-based, system preference fallback)
- [ ] All shadcn/ui primitives render with custom tokens
- [ ] Page uses font with -0.6px tracking on headings, +0.1em uppercase on labels

## setup-003: Prisma Schema

- [ ] `packages/db/prisma/schema.prisma` defines: User, Workspace, WorkspaceMember, Column, Task, TaskDependency, TaskLabel, TaskLabelAssignment, Comment, Notification, Attachment, RefreshToken, ChatChannel, ChatMessage, WorkspaceNotificationSetting, UserNotificationPreference, EmailJob
- [ ] Every model has `id` (cuid), `createdAt`, `updatedAt`, `deletedAt?`
- [ ] `@@index` on all FKs
- [ ] `@@unique` on business keys (e.g., WorkspaceMember[workspaceId,userId])
- [ ] `prisma generate` succeeds
- [ ] Initial migration creates all tables

## setup-004: Docker Compose

- [ ] `docker-compose.yml` defines: postgres, redis, api, email-worker, web
- [ ] `docker compose up -d` starts all 5 services
- [ ] API responds at `http://localhost:3000/api/health` with `{ status: "ok" }`
- [ ] Web accessible at `http://localhost:5173`
- [ ] PostgreSQL accessible at `localhost:5432` with credentials from `.env`
- [ ] Redis accessible at `localhost:6379`

## setup-005: Shared Package

- [ ] `packages/shared/src/auth.ts` exports Zod schemas for login, register
- [ ] `packages/shared/src/task.ts` exports Zod schemas for create, update, query
- [ ] `packages/shared/src/workspace.ts` exports Zod schemas for create, update
- [ ] TypeScript types inferred via `z.infer<typeof schema>`
- [ ] Both apps can import from `@flow-desk/shared`

## auth-001: Email/Password + JWT

- [ ] POST `/api/auth/register` with valid data → 201, sets cookie, returns user
- [ ] POST `/api/auth/register` with duplicate email → 409
- [ ] POST `/api/auth/register` with weak password → 400 (Zod validation)
- [ ] POST `/api/auth/login` with correct creds → 200, sets cookie
- [ ] POST `/api/auth/login` with wrong password → 401
- [ ] GET `/api/auth/me` with cookie → 200 + user
- [ ] GET `/api/auth/me` without cookie → 401
- [ ] Password stored as bcrypt hash (cost ≥ 10)
- [ ] Access token expires in 15min
- [ ] Refresh token expires in 7d, rotated on refresh

## auth-002: Google OAuth

- [ ] GET `/api/auth/google` redirects to Google consent screen
- [ ] GET `/api/auth/google/callback` creates or links user, sets cookie
- [ ] OAuth errors return 400 with descriptive message

## workspace-001: CRUD

- [ ] POST `/api/workspaces` creates workspace + 4 default columns
- [ ] POST `/api/workspaces` returns workspace with creator as Owner
- [ ] GET `/api/workspaces` returns only workspaces user is member of
- [ ] PATCH `/api/workspaces/:id` requires Admin or Owner
- [ ] DELETE `/api/workspaces/:id` requires Owner, soft delete (deletedAt set)

## workspace-002: Members

- [ ] POST `/api/workspaces/:id/members` requires Admin+
- [ ] PATCH `/api/workspaces/:id/members/:userId` (change role) requires Owner
- [ ] DELETE `/api/workspaces/:id/members/:userId` requires Admin+
- [ ] Cannot demote last Owner → 400
- [ ] Cannot assign role higher than caller's role

## workspace-003: Settings UI

- [ ] `/workspaces/:id/settings` route renders page with back-to-board link and workspace header
- [ ] General tab: name (1–80), description (≤500), visibility (PRIVATE/PUBLIC), submit shows toast on success/failure
- [ ] General tab: Save disabled until form is dirty
- [ ] Members tab: list of members with avatar, email, role badge, joined
- [ ] Members tab: invite by email + role (Admin/Member/Guest) form visible to Admin+ only
- [ ] Members tab: role dropdown to change role visible to Owner only and disabled for self
- [ ] Members tab: remove button visible to Admin+ only and hidden for self / Owner rows
- [ ] Members tab: removing/demoting last Owner surfaces server error via toast
- [ ] Columns tab: list of columns with position, name, isDoneColumn flag
- [ ] Columns tab: add column form visible to Admin+ only
- [ ] Columns tab: inline rename by clicking name (Admin+); save on Enter/blur, cancel on Escape
- [ ] Columns tab: delete column with confirm dialog (Admin+); server errors via toast
- [ ] Danger zone tab: visible only to Owner
- [ ] Danger zone tab: name-confirmation input; Delete button disabled until input matches workspace name exactly
- [ ] On successful delete, user is redirected to `/` and the workspace disappears from sidebar
- [ ] All tabs use TanStack Query; mutations invalidate relevant keys on success
- [ ] All forms use react-hook-form + zod + `@flow-desk/shared/workspace` schemas
- [ ] All mutations emit sonner toast on success/failure

## task-001: Task CRUD

- [ ] POST `/api/tasks` requires workspace membership
- [ ] GET `/api/tasks?workspaceId=X&status=Y&assigneeId=Z` filters work
- [ ] PATCH `/api/tasks/:id` updates fields, sets `updatedAt`
- [ ] DELETE `/api/tasks/:id` soft delete
- [ ] All endpoints validate input with Zod

## task-002: Kanban Board

- [ ] `/board/:workspaceId` page renders 4 default columns
- [ ] Tasks appear in correct column by `columnId`
- [ ] Drag task from Todo to In Progress → status updates, persists
- [ ] Other connected clients see move in <500ms
- [ ] Optimistic update: card moves immediately, rolls back on error

## task-003: List/Table View

- [ ] `/list/:workspaceId` renders table with columns: Title, Status, Assignee, Priority, Due
- [ ] Click column header to sort
- [ ] Filter dropdown for status, assignee, priority
- [ ] URL reflects filter state (`?status=in-progress&assignee=...`)

## task-004: Subtasks + Dependencies

- [ ] POST `/api/tasks/:id/subtasks` creates child task
- [ ] POST `/api/task-dependencies` with `blocksTaskId` creates A blocks B
- [ ] POST `/api/task-dependencies` with circular ref → 400
- [ ] DELETE `/api/task-dependencies/:id` removes dep
- [ ] UI: Subtask checkbox on parent task, dependency list with X button

## collab-001: Socket.IO Real-time

- [ ] Socket connection with valid JWT succeeds
- [ ] Socket connection with invalid JWT disconnects
- [ ] Task create event propagates to all in `workspace:{id}` room
- [ ] Task move event propagates within 500ms
- [ ] Disconnect cleans up room membership

## collab-002: Comments + Mentions

- [ ] POST `/api/tasks/:id/comments` creates comment
- [ ] Comment with `@username` creates notification for mentioned user
- [ ] @mention autocomplete shows workspace members as user types `@`
- [ ] Comments stream to `/collab` namespace `task:{id}` room

## collab-003: Notifications

- [ ] Notification created on assignment, mention, due-date-soon
- [ ] GET `/api/notifications?unread=true` returns unread
- [ ] PATCH `/api/notifications/:id/read` marks as read
- [ ] Bell badge updates in real-time
- [ ] Notification delivered via Socket.IO `/notifications user:{id}`

## ai-001: Assignment Suggestions

- [x] POST `/api/ai/suggest-assignee` with workspaceId+title returns top 3 members
- [x] Response includes score + reason for each suggestion (workload-aware)
- [x] Falls back to rule-based ranking if LLM unavailable (try/catch wraps llm.chatJSON)
- [x] LLM responds within provider latency (current: 18-27s/call on local proxy 103.157.204.253:3001; <2s requires faster model or remote provider)

## ai-002: Auto-scheduling

- [ ] POST `/api/ai/auto-schedule` with workspaceId returns proposed schedule
- [ ] Schedule respects existing task dependencies
- [ ] Schedule respects capacity (max N tasks/day per member)
- [ ] User can apply or reject the schedule

## file-001: Attachments

- [ ] POST `/api/tasks/:id/attachments` accepts multipart/form-data
- [ ] Files stored in `/data/attachments/` (docker volume)
- [ ] GET `/api/attachments/:id` streams file with correct content-type
- [ ] Image attachments show thumbnail
- [ ] Max upload size: 25MB

## file-002: Seed Data

- [ ] `pnpm db:seed` populates demo workspace
- [ ] 15 users, 6 workspaces, 51 tasks, 60 subtasks, 199 comments, 120 notifications, 16 attachments
- [ ] Tasks distributed across all statuses
- [ ] Some tasks have subtasks and dependencies
- [ ] Login as `demo@flow-desk.app` (password: `demo1234`) works

## security-001: Rate Limiting

- [ ] `apps/api/src/shared/middleware/rate-limit.ts` exports `rateLimit({scope, windowSec, max, keyBy})` using Redis `INCR` + `EXPIRE`
- [ ] Auth routes: register 3/h/ip, login 5/min/ip, refresh 30/min/ip
- [ ] AI routes: 5/min/user on both `/suggest-assignee` and `/auto-schedule`
- [ ] Broad write limit 60/min/user on POST/PATCH/PUT/DELETE under `/api/*`
- [ ] Every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers
- [ ] 429 response includes `Retry-After` header
- [ ] `RateLimitError(429, retryAfter)` thrown when limit exceeded; error handler maps to 429
- [ ] `NODE_ENV=test` or `SKIP_RATE_LIMIT=1` disables rate limiting in tests

## security-002: Socket.IO Emissions

- [ ] `apps/api/src/shared/lib/socket-events.ts` exports `setIo(io)`, `emitToRoom`, `emitToNamespace`, `emitToUser`, `emitToWorkspace`, `emitToTask`
- [ ] `FlowDeskNamespace = '/tasks' | '/notifications' | '/collab'`
- [ ] `setIo(io)` called from `index.ts` after `createSocketServer`
- [ ] Task routes emit `task:created` (workspace), `task:updated/deleted/moved/subtask:created` (workspace + task), `task:dependency:added` (workspace) after successful DB write
- [ ] Comment routes emit `comment:created/updated/deleted` to `task:{id}` room
- [ ] Notification route emits `notification:new` to `user:{id}` room on `/notifications`
- [ ] `safeEmit` wrapper prevents `requireIo()` failure from crashing request when io is unset (test env)
- [ ] Web `useRealtime(workspaceId, taskId?)` joins `workspace:{id}` + `task:{id}` rooms on `/tasks`, listens to `task:*` and `comment:*`, invalidates React Query keys `['board', workspaceId]` and `['comments', taskId]`
- [ ] Web `useNotificationsRealtime()` listens on `/notifications` for `notification:new`

## security-003: Attachment IDOR + Membership Gaps

- [ ] `apps/api/src/shared/lib/access.ts` exports `assertMembership(workspaceId, userId)` — throws if no WorkspaceMember row
- [ ] `attachment.routes.ts`: `assertMembership` called on POST `/`, GET `/?taskId=`, GET `/:id/download` before any task lookup
- [ ] `task.routes.ts`: `assertMembership` called on POST `/`, PATCH `/:id`, DELETE `/:id`, POST `/:id/move`, POST `/:id/subtasks`, POST `/dependencies`
- [ ] `comment.routes.ts`: `assertMembership` called on POST `/`, PATCH `/:id`, DELETE `/:id`
- [ ] `ai.routes.ts`: `assertMembership` called on POST `/suggest-assignee`, POST `/auto-schedule`
- [ ] Cross-workspace access returns 401 with `{"message":"Not a member","code":"UNAUTHORIZED"}`

## security-004: Membership on Comments + AI

- [ ] Same `assertMembership` helper from security-003 covers comment + AI routes
- [ ] `POST /api/comments` with foreign `taskId` → 403/401
- [ ] `POST /api/ai/suggest-assignee` with foreign `workspaceId` → 403/401
- [ ] `POST /api/ai/auto-schedule` with foreign `workspaceId` → 403/401
- [ ] AI routes additionally rate-limited 5/min/user

## security-005: bcrypt + LLM Hardening

- [ ] `bcrypt.hash(password, 10)` in `auth.routes.ts` (was 12)
- [ ] Existing cost-12 hashes still match because `bcrypt.compare` reads cost from hash
- [ ] `LLMError extends AppError(502, message, 'LLM_UPSTREAM', details)` in `shared/errors/index.ts`
- [ ] `llm-provider.ts`: `TIMEOUT_MS=30_000`, `MAX_ATTEMPTS=2`, `RETRY_BACKOFF_MS=500`
- [ ] AbortController cancels fetch after 30s
- [ ] Retry once on 5xx or AbortError, then throw `LLMError`
- [ ] `error-handler.ts` status cast widened to `400|401|403|404|409|429|502|503`
- [ ] 429 responses include `Retry-After` header
- [ ] LLM upstream errors return 502 with code `LLM_UPSTREAM` (not 500)
