# Progress Log

## Current Verified State

- **Repository root**: `/home/thanh/flow-desk`
- **Standard startup path**: `docker compose up -d` (PostgreSQL + Redis + API + Web)
- **Standard verification path**: `pnpm --filter @flow-desk/shared build` + curl API endpoints
- **Highest priority unfinished feature**: `task-003` (List/Table view UI)
- **Current blocker**: 2 features blocked on external config (auth-002: Google creds, ai-001: LLM_API_KEY)

## Session Log

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
