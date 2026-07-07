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

## Local dev

One command does everything: starts postgres + redis in Docker, runs migrations + seed, then starts api + web + shared on the host with hot-reload.

```bash
pnpm dev
# - starts postgres + redis via Docker (auto-detects port conflicts; falls back to 5433/6380)
# - patches .env DATABASE_URL + REDIS_URL to match actual ports
# - pnpm install + shared build + prisma generate + migrate deploy + seed
# - turbo: shared tsup --watch + api tsx watch + web vite
```

- Web: <http://localhost:5173>
- API: <http://localhost:3000>
- Demo creds: `demo@flow-desk.app` / `demo1234`

Ctrl-C stops app processes; postgres + redis stay running in Docker. To stop infra: `pnpm stack:dev-down`.

Reset DB before starting:

```bash
pnpm dev:reset            # drop DB volume, then pnpm dev
```

### Raw turbo dev (no infra management)

If postgres + redis are already up (Docker or native) and you only want the watch loop:

```bash
pnpm dev:turbo            # turbo: shared tsup --watch + api tsx watch + web vite
```

No `.env` port patching. Use this when the `pnpm dev` wrapper isn't needed.

## Dev mode with hot reload in Docker

For an iteration loop without rebuilding the api image on every change:

```bash
pnpm stack:dev-build      # one-time: build api image with devDeps (tsx, tsup) baked in
pnpm stack:dev            # up postgres + redis + api (bind-mounts apps/api/src + packages/shared/src)
```

The api container runs `pnpm --filter @flow-desk/shared dev & pnpm --filter @flow-desk/api dev` — `tsup --watch` rebuilds `packages/shared/dist` on shared source edits; `tsx watch` restarts the api process on `apps/api/src` edits. Both source trees are bind-mounted from the host.

Edit host files → container restarts within ~1s. No image rebuild needed.

To go back to the production image:

```bash
pnpm stack:dev-down
pnpm stack:up             # uses compiled dist/index.js, no hot reload
```

## Repo layout

```
docs/USER.md         # End-user guide (install + features + how-to)
docs/DEV.md          # Developer onboarding
docs/ARCHITECTURE.md # Architecture deep-dive (read once before editing a module)
apps/web/            # React + Vite
apps/api/            # Hono + Prisma
packages/shared/     # Zod schemas + types
packages/db/         # Prisma schema + migrations + generated client
packages/env/        # Environment variable validation (Zod)
prisma.config.ts     # Prisma 7 config (schema path, seed, datasource)
docker/              # Dockerfiles + nginx config
scripts/             # dev.sh (one-command dev), docker-up.sh, prisma-exec.sh
e2e/                 # Playwright E2E tests
plans/               # Audit remediation plans
PRD.md               # Product requirements
ADR-*.md             # Architecture decisions (001..006)
TASKS.md             # Sprint backlog
ACCEPTANCE.md        # Testable acceptance criteria
RISKS.md             # Risk register
AGENTS.md            # Agent operating instructions
```

## Git hooks (lefthook)

Hooks are managed by [lefthook](https://github.com/evilmartians/lefthook) (config: `lefthook.yml`).

- `pnpm setup:lefthook` — install hooks (also runs in `./init.sh`)
- `pnpm check:secrets` — re-run the secret scanner manually
- `pnpm verify` — run all pre-commit + pre-push gates locally

**pre-commit** (fast, ~15s):

- Secret scan (`.githooks/pre-commit`)
- Per-package typecheck (`shared` / `api` / `web`) — only the package whose files changed

**pre-push** (heavier, ~60-90s):

- Full typecheck (all packages)
- BE integration tests (190 tests)
- Web build

Bypass (emergency): `git commit --no-verify` / `git push --no-verify`.

## Recent changes

- **Session 028 (dev workflow + docker)**: New `pnpm dev` one-command wrapper (`scripts/dev.sh`) — starts postgres + redis in Docker, patches `.env` ports, runs migrate + seed, then turbo watch loop with hot-reload. Auto port-conflict detection (5432→5433, 6379→6380). Dockerfiles + docker-compose cleaned (DRY `x-common-env` anchor, dropped unused `deps` stage). `dev:local` deprecated (redirects to `pnpm dev`).
- **Session 025 (dev workflow)**: Fixed integration test env (Redis port 6379→6390, DB password flowdesk→postgres), created `apps/api/.env` symlink, verified 190/190 tests pass. Updated docs with hybrid dev mode (docker services + `pnpm dev`).
- **Session 024 (test fixes)**: Fixed 7 broken unit tests + docker inspect error from audit batch changes. 97/97 unit tests pass.
- **Session 023 (improve audit)**: Full /improve audit — 14 plans executed across 3 batches. Email worker, security, performance, tech debt, correctness, test pipeline all improved.
- **Session 022 (kanban-sprint-1.5)**: RC3 (optimistic reorder race), RC5 (same-position move), RC6 (DragOverlay snap) fixed.
- **Session 021 (kanban-sprint-1)**: Click bubbling, PointerSensor lag, nested role=button fixed.
- **Session 019 (post-F8)**: Dev startup race condition + seed FK constraint fix.
- See `CHANGELOG.md`, `claude-progress.md`, and `feature_list.json` for full history.

## Security

- **Rate limiting**: Redis-backed sliding-window middleware on auth (`auth:register` 3/h/ip, `auth:login` 5/min/ip, `auth:refresh` 30/min/ip), AI routes (5/min/user), and all `/api/*` writes (60/min/user). Every response carries `X-RateLimit-*` headers; 429 responses include `Retry-After`.
- **Membership**: `assertMembership(workspaceId, userId)` enforced on every attachment, comment, task, dependency, and AI mutation. Cross-workspace access returns 401.
- **Real-time**: Socket.IO namespaces `/tasks`, `/notifications`, `/collab` with JWT auth on connection. Server emits after successful DB writes (no false-positive broadcasts on rollback).
- **Password hashing**: bcrypt cost 10 (was 12 in pre-F1 baseline; reduced to keep login ~100ms without rate-limit DoS risk).
- **LLM safety**: 30s AbortController timeout, 1 retry on 5xx, `LLMError` maps to 502 with code `LLM_UPSTREAM`.
- See `ADR-006-security-middleware-pattern.md` for the middleware architecture.

## License

MIT
