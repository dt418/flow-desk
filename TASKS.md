# TASKS — FlowDesk Implementation Backlog

## Sprint 1: Foundation (Days 1-5)

### Epic: Project Setup

| Story                         | Tasks                                                                                                                           | Estimate | Status      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| **setup-001**: Monorepo       | Create pnpm-workspace.yaml, turbo.json, root package.json, apps/web, apps/api, packages/shared directories + package.json files | 1d       | passing     |
| **setup-002**: Tailwind v4    | Install Tailwind v4, configure design tokens, create globals.css, shadcn/ui init                                                | 1d       | passing     |
| **setup-003**: Prisma schema  | Install Prisma, write schema.prisma with all entities, run prisma generate                                                      | 1d       | passing     |
| **setup-004**: Docker Compose | Write docker-compose.yml, Dockerfiles for api + web, .env.example                                                               | 1d       | passing     |
| **setup-005**: Shared package | Export Zod schemas for User, Task, Workspace, Comment, Auth                                                                     | 1d       | passing     |

## Sprint 2: Authentication (Days 6-8)

### Epic: User Auth

| Story                              | Tasks                                                                                                                       | Estimate | Status      |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| **auth-001**: Email/password + JWT | bcrypt password hash, register/login endpoints, JWT issue/verify, httpOnly cookie set, /me endpoint, refresh token rotation | 2d       | passing     |
| **auth-002**: Google OAuth         | OAuth flow with passport-google or manual, link account, return JWT                                                         | 1d       | blocked     |

## Sprint 3: Workspaces (Days 9-11)

### Epic: Multi-tenant Workspaces

| Story                      | Tasks                                                                           | Estimate | Status      |
| -------------------------- | ------------------------------------------------------------------------------- | -------- | ----------- |
| **workspace-001**: CRUD    | POST/GET/PATCH/DELETE /workspaces, create default columns on creation           | 1.5d     | passing     |
| **workspace-002**: Members | POST/GET/PATCH/DELETE /workspaces/:id/members, role-based permission middleware | 1.5d     | passing     |
| **workspace-003**: Settings UI | Tabbed page (General / Members / Columns / Danger zone) with role-gated actions | 1.5d     | passing     |

## Sprint 4: Task Management (Days 12-18)

### Epic: Tasks

| Story                         | Tasks                                                                             | Estimate | Status      |
| ----------------------------- | --------------------------------------------------------------------------------- | -------- | ----------- |
| **task-001**: Task CRUD       | POST/GET/PATCH/DELETE /tasks, query filters (status, assignee, priority, dueDate) | 2d       | passing     |
| **task-002**: Kanban board    | Board page, column components, drag-drop with dnd-kit, status update on drop      | 2d       | passing     |
| **task-003**: List/Table view | Table component, column sort, filter UI, URL state sync                           | 1.5d     | passing     |
| **task-004**: Subtasks + deps | Subtask CRUD, dependency create/delete, circular detection                        | 1.5d     | passing     |
| **kanban-bugs-fix**: B1 New task no-op + B2 drag-drop position not saved | Wire "New task" button → modal → POST /api/tasks with optimistic create; send {columnId, position, version} on move; server splice + renumber in prisma.$transaction | 0.5d | passing |

## Sprint 5: Collaboration (Days 19-25)

### Epic: Real-time + Comments

| Story                         | Tasks                                                                                   | Estimate | Status      |
| ----------------------------- | --------------------------------------------------------------------------------------- | -------- | ----------- |
| **collab-001**: Socket.IO     | Server setup with Redis adapter, JWT auth middleware, /tasks namespace, room join/leave | 2d       | passing     |
| **collab-002**: Comments      | Comment CRUD, @mention extraction, autocomplete UI, notification trigger                | 2d       | passing     |
| **collab-003**: Notifications | Notification model, real-time delivery, badge count, mark-as-read                       | 2d       | passing     |

## Sprint 6: AI Features (Days 26-30)

### Epic: AI

| Story                              | Tasks                                                                                          | Estimate | Status      |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- | -------- | ----------- |
| **ai-001**: Assignment suggestions | LLMProvider class, service to rank members by workload + history, return top 3                 | 2.5d     | passing     |
| **ai-002**: Auto-scheduling        | Constraint solver (deps + deadlines + capacity), LLM-assisted date estimation, return schedule | 2.5d     | passing     |

## Sprint 7: Polish (Days 31-33)

### Epic: Production Ready

| Story                          | Tasks                                                                         | Estimate | Status      |
| ------------------------------ | ----------------------------------------------------------------------------- | -------- | ----------- |
| **file-001**: File attachments | Multer/multipart upload, local storage in docker volume, thumbnail generation | 1.5d     | passing     |
| **file-002**: Seed data        | seed.ts with 5 users, 3 workspaces, 50+ tasks, 30+ comments                   | 1d       | passing     |

## Sprint 8: Security Hardening (Day 34)

### Epic: Close P0 Security Gaps

| Story | Tasks | Estimate | Status |
| ----- | ----- | -------- | ------ |
| **security-001**: Rate limiting on auth/AI/write paths | Redis INCR+EXPIRE sliding-window middleware (`shared/middleware/rate-limit.ts`); auth:register 3/h/ip, auth:login 5/min/ip, auth:refresh 30/min/ip, AI 5/min/user, broad write 60/min/user; X-RateLimit-* headers; RateLimitError with Retry-After | 0.5d | passing |
| **security-002**: Socket.IO server-side emissions | `shared/lib/socket-events.ts` singleton + `setIo(io)` + `emitToRoom/Namespace/User/Workspace/Task` over FlowDeskNamespace = `/tasks \| /notifications \| /collab`; task routes emit `task:created/updated/deleted/moved/subtask:created/dependency:added`; comment routes emit `comment:created/updated/deleted`; notification emit `notification:new` to `user:{id}` room | 0.5d | passing |
| **security-003**: Attachment IDOR closed + membership gaps fixed | `shared/lib/access.ts` `assertMembership(workspaceId, userId)`; applied to attachment POST/GET?taskId=/:id/download, task POST/PATCH/DELETE/move/subtasks/deps, comment POST/PATCH/DELETE, AI suggest-assignee/auto-schedule | 0.5d | passing |
| **security-004**: Membership checks on POST /comments and AI routes | Same `assertMembership` helper; AI routes additionally rate-limited 5/min/user | 0.25d | passing |
| **security-005**: bcrypt cost 10 + LLM provider hardening | bcrypt 12 → 10 in `auth.routes.ts`; `LLMError extends AppError(502, 'LLM_UPSTREAM')`; AbortController 30s timeout + 1 retry on 5xx/AbortError with 500ms backoff; error-handler status cast widened to `400\|401\|403\|404\|409\|429\|502\|503` | 0.25d | passing |
