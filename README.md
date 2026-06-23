# FlowDesk

Self-hosted, AI-augmented task management. Kanban + list view, real-time collaboration, comments, mentions, and OpenAI-compatible AI features (assignment suggestions, auto-scheduling).

## Tech stack

- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS v4 + shadcn/ui
- **Backend**: Hono + Node.js + TypeScript
- **DB / cache**: PostgreSQL 16 + Redis 7
- **ORM**: Prisma
- **Realtime**: Socket.IO (Redis adapter)
- **Auth**: JWT in httpOnly cookie (bcrypt + Google OAuth)
- **AI**: OpenAI-compatible (custom `baseUrl` + `model`)
- **Deployment**: single `docker compose up`

## Quick start (Docker)

```bash
cp .env.example .env
# Edit .env — at minimum set JWT_SECRET, LLM_API_KEY
pnpm stack:up            # docker compose up -d (auto-detects port conflicts)
# Web: http://localhost:5173
# API: http://localhost:3000
```

Stack management:

```bash
pnpm stack:up             # start stack (auto-override ports if conflict)
pnpm stack:up-build       # rebuild images + start
pnpm stack:down           # stop stack
pnpm stack:logs           # tail all service logs
pnpm stack:ps             # list running services
```

Seed demo data:

```bash
pnpm db:seed              # runs seed (esbuild on host, node inside api container)
```

Login: `demo@flow-desk.app` / `demo1234`

## Database (Prisma)

All prisma commands run from root through turbo + `scripts/prisma-exec.sh`. The wrapper picks a mode:

- **docker** (default): exec inside the api container where `postgres:5432` resolves. If the api container is not running, the wrapper auto-starts the stack via `scripts/docker-up.sh`.
- **local**: run prisma on the host, sourcing `.env` from root. The wrapper never touches the docker stack in this mode.

Set `FLOW_DESK_DB_MODE=docker|local` to override. Invalid values are rejected with exit code 64.

```bash
pnpm db:push              # db push (regenerate client)
pnpm db:push-skip-generate # db push without regenerating client
pnpm db:migrate           # prisma migrate dev (interactive)
pnpm db:migrate-deploy    # prisma migrate deploy (CI / production)
pnpm db:seed              # seed demo data (esbuild on host + node in chosen mode)
pnpm db:studio            # prisma studio on http://localhost:5555
pnpm db:reset             # drop + recreate DB + push schema (DESTRUCTIVE)
pnpm prisma db push --skip-generate  # arbitrary prisma args via wrapper

# Force mode (override default):
FLOW_DESK_DB_MODE=local  pnpm db:push    # always run on host, no docker stack
FLOW_DESK_DB_MODE=docker pnpm db:push    # always use docker (auto-starts stack)
```

The same commands work from `apps/api/` directly:

```bash
cd apps/api && pnpm db:push      # same wrapper, same auto-detect
cd apps/api && pnpm db:seed      # same wrapper, same auto-detect
```

## Local dev (without Docker)

```bash
# Requires local postgres on localhost:5432 and redis on localhost:6379
pnpm install
pnpm dev:local            # install + shared build + prisma generate + migrate + seed + run api+web
```

For local dev, set `DATABASE_URL=postgresql://flowdesk:flowdesk@localhost:5432/flowdesk?schema=public` in `.env` (not `postgres:5432`, which is the docker hostname).

- Web: <http://localhost:5173>
- API: <http://localhost:3000>

## Repo layout

```
apps/web/        # React + Vite
apps/api/        # Hono + Prisma
packages/shared/ # Zod schemas + types
prisma/          # schema.prisma + seed.ts
docker/          # Dockerfiles + nginx config
scripts/         # dev-local.sh (no Docker) + docker-up.sh (smart compose)
PRD.md           # Product requirements
ADR-*.md         # Architecture decisions (001..006)
TASKS.md         # Sprint backlog
ACCEPTANCE.md    # Testable acceptance criteria
RISKS.md         # Risk register
AGENTS.md        # Agent operating instructions
```

## Recent changes

- **Session 012 (F3-F6)**: closed R-29 (soft-delete extension), R-30 (cursor pagination), R-31 (service/repo split for all remaining modules), R-32 (142 integration tests), R-34 (real-card DragOverlay + server presence gateway). 142/142 BE tests pass.
- **Session 011 (F2 Kanban Polish)**: labels module (BE+FE), workspace service split, member invite endpoint, Radix primitives (dialog/dropdown-menu/popover/tooltip), workspace switcher, settings UI, task-card label select, welcome flow, realtime polish, Playwright E2E scaffold.
- See `CHANGELOG.md`, `claude-progress.md`, and `feature_list.json` for the full session record.

## Security

- **Rate limiting**: Redis-backed sliding-window middleware on auth (`auth:register` 3/h/ip, `auth:login` 5/min/ip, `auth:refresh` 30/min/ip), AI routes (5/min/user), and all `/api/*` writes (60/min/user). Every response carries `X-RateLimit-*` headers; 429 responses include `Retry-After`.
- **Membership**: `assertMembership(workspaceId, userId)` enforced on every attachment, comment, task, dependency, and AI mutation. Cross-workspace access returns 401.
- **Real-time**: Socket.IO namespaces `/tasks`, `/notifications`, `/collab` with JWT auth on connection. Server emits after successful DB writes (no false-positive broadcasts on rollback).
- **Password hashing**: bcrypt cost 10 (was 12 in pre-F1 baseline; reduced to keep login ~100ms without rate-limit DoS risk).
- **LLM safety**: 30s AbortController timeout, 1 retry on 5xx, `LLMError` maps to 502 with code `LLM_UPSTREAM`.
- See `ADR-006-security-middleware-pattern.md` for the middleware architecture.

## License

MIT
