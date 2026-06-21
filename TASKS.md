# TASKS — FlowDesk Implementation Backlog

## Sprint 1: Foundation (Days 1-5)

### Epic: Project Setup
| Story | Tasks | Estimate | Status |
|-------|-------|----------|--------|
| **setup-001**: Monorepo | Create pnpm-workspace.yaml, turbo.json, root package.json, apps/web, apps/api, packages/shared directories + package.json files | 1d | not_started |
| **setup-002**: Tailwind v4 | Install Tailwind v4, configure design tokens, create globals.css, shadcn/ui init | 1d | not_started |
| **setup-003**: Prisma schema | Install Prisma, write schema.prisma with all entities, run prisma generate | 1d | not_started |
| **setup-004**: Docker Compose | Write docker-compose.yml, Dockerfiles for api + web, .env.example | 1d | not_started |
| **setup-005**: Shared package | Export Zod schemas for User, Task, Workspace, Comment, Auth | 1d | not_started |

## Sprint 2: Authentication (Days 6-8)

### Epic: User Auth
| Story | Tasks | Estimate | Status |
|-------|-------|----------|--------|
| **auth-001**: Email/password + JWT | bcrypt password hash, register/login endpoints, JWT issue/verify, httpOnly cookie set, /me endpoint, refresh token rotation | 2d | not_started |
| **auth-002**: Google OAuth | OAuth flow with passport-google or manual, link account, return JWT | 1d | not_started |

## Sprint 3: Workspaces (Days 9-11)

### Epic: Multi-tenant Workspaces
| Story | Tasks | Estimate | Status |
|-------|-------|----------|--------|
| **workspace-001**: CRUD | POST/GET/PATCH/DELETE /workspaces, create default columns on creation | 1.5d | not_started |
| **workspace-002**: Members | POST/GET/PATCH/DELETE /workspaces/:id/members, role-based permission middleware | 1.5d | not_started |

## Sprint 4: Task Management (Days 12-18)

### Epic: Tasks
| Story | Tasks | Estimate | Status |
|-------|-------|----------|--------|
| **task-001**: Task CRUD | POST/GET/PATCH/DELETE /tasks, query filters (status, assignee, priority, dueDate) | 2d | not_started |
| **task-002**: Kanban board | Board page, column components, drag-drop with dnd-kit, status update on drop | 2d | not_started |
| **task-003**: List/Table view | Table component, column sort, filter UI, URL state sync | 1.5d | not_started |
| **task-004**: Subtasks + deps | Subtask CRUD, dependency create/delete, circular detection | 1.5d | not_started |

## Sprint 5: Collaboration (Days 19-25)

### Epic: Real-time + Comments
| Story | Tasks | Estimate | Status |
|-------|-------|----------|--------|
| **collab-001**: Socket.IO | Server setup with Redis adapter, JWT auth middleware, /tasks namespace, room join/leave | 2d | not_started |
| **collab-002**: Comments | Comment CRUD, @mention extraction, autocomplete UI, notification trigger | 2d | not_started |
| **collab-003**: Notifications | Notification model, real-time delivery, badge count, mark-as-read | 2d | not_started |

## Sprint 6: AI Features (Days 26-30)

### Epic: AI
| Story | Tasks | Estimate | Status |
|-------|-------|----------|--------|
| **ai-001**: Assignment suggestions | LLMProvider class, service to rank members by workload + history, return top 3 | 2.5d | not_started |
| **ai-002**: Auto-scheduling | Constraint solver (deps + deadlines + capacity), LLM-assisted date estimation, return schedule | 2.5d | not_started |

## Sprint 7: Polish (Days 31-33)

### Epic: Production Ready
| Story | Tasks | Estimate | Status |
|-------|-------|----------|--------|
| **file-001**: File attachments | Multer/multipart upload, local storage in docker volume, thumbnail generation | 1.5d | not_started |
| **file-002**: Seed data | seed.ts with 5 users, 3 workspaces, 50+ tasks, 30+ comments | 1d | not_started |