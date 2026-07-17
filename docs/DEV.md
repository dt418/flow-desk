# FlowDesk Developer Guide

For new engineers joining the team. Read once, then keep open as a reference. The full architecture tour is `docs/ARCHITECTURE.md`. Operating instructions for coding agents are in `AGENTS.md`.

## Repo Map

    apps/web/         # React 18 + Vite + TypeScript + Tailwind v4 + shadcn/ui
    apps/api/         # Hono + Node 22 + TypeScript + Prisma 7 + Socket.IO
    packages/shared/  # Zod schemas + types shared by web and api
    packages/db/      # Prisma schema + migrations + generated client (`packages/db/generated`, package `@flowdesk/db`)
    packages/env/     # Environment variable validation (Zod)
    prisma.config.ts  # Prisma 7 config at repo root (schema path, seed, datasource)
    docker/           # Dockerfiles + nginx config
    scripts/          # dev.sh (one-command dev), docker-up.sh, prisma-exec.sh
    docs/             # USER.md, DEV.md, ARCHITECTURE.md, superpowers/specs+plans/
    e2e/              # Playwright E2E (browser-based)
    plans/            # Audit remediation plans

Forging session notes live in `claude-progress.md`. Compact handoffs in `session-handoff.md`. Architecture decisions log: each `ADR-*.md`. Feature state source of truth: `feature_list.json`.

## Stack

Layered architecture. Two halves:

- **Backend (`apps/api`)**: Hono routes → service → repository → Prisma (`@flowdesk/db` / `packages/db/generated`). Soft-delete: `packages/db/src/prisma-extension.ts`. Read `docs/ARCHITECTURE.md` and `ADR-006-security-middleware-pattern.md`.
- **Frontend (`apps/web`)**: feature folders under `apps/web/src/features/{feature}/` with `components/`, `hooks/`, `api.ts`, `types.ts`, `index.ts`. Public surface is `index.ts`. Posted data is mutated via TanStack Query, never raw `useEffect` fetches.

## Setup

One-time:

    ./init.sh                       # pnpm install + shared build + lefthook install

Run the stack:

    cp .env.example .env            # edit: JWT_SECRET, LLM_API_KEY at minimum
    pnpm stack:up                   # docker compose up -d (auto-detects port conflicts)
    pnpm db:seed                    # 15 users / 6 workspaces / 51 tasks / 60 subtasks / 199 comments / 120 notifications / 16 attachments

Verify:

    curl http://localhost:3000/api/health
    open http://localhost:5173      # login: demo@flow-desk.app / demo1234

## Local Dev

One command does everything: starts postgres + redis in Docker, runs migrations + seed, then starts api + web + shared on the host with hot-reload.

    pnpm dev
    # - starts postgres + redis via Docker (auto-detects port conflicts; 5432→5433, 6379→6380)
    # - patches .env DATABASE_URL + REDIS_URL to match actual ports
    # - pnpm install + shared build + prisma generate + migrate deploy + seed
    # - turbo: shared tsup --watch + api tsx watch + web vite

Ctrl-C stops app processes; postgres + redis stay running in Docker. To stop infra: `pnpm stack:dev-down`.

Reset DB before starting:

    pnpm dev:reset                 # drop DB volume, then pnpm dev

### Raw turbo dev (infra already up)

If postgres + redis are already up (Docker or native) and you only want the watch loop:

    pnpm dev:turbo                 # turbo: shared tsup --watch + api tsx watch + web vite

No `.env` port patching. Use this when the `pnpm dev` wrapper isn't needed.

### Docker hot-reload mode (no host-side node)

Binds host source into the api container:

    pnpm stack:dev-build           # one-time: bake tsx + tsup into api image
    pnpm stack:dev                 # up postgres + redis + api (bind-mounts apps/api/src + packages/shared/src)
    pnpm stack:dev-down            # stop the dev stack

All modes start shared (`tsup --watch`) + api (`tsx watch`) + web (vite) for hot-reload.

## Database (Prisma)

The standard DB wrapper is `scripts/prisma-exec.sh`. It auto-detects docker-vs-host and rejects invalid `FLOW_DESK_DB_MODE` values (`docker|local`).

    pnpm db:push
    pnpm db:migrate
    pnpm db:studio                  # http://localhost:5555
    pnpm db:reset                   # DESTRUCTIVE — drops + re-pushes schema
    pnpm prisma db push --skip-generate   # arbitrary prisma args via wrapper

## Module Layout

Backend. `apps/api/src/modules/{feature}/` with one job per file:

- `{feature}.routes.ts` — Hono router + zValidator + per-route rate limit.
- `{feature}.service.ts` — business logic; orchestrates repos, cache, sockets.
- `{feature}.repository.ts` — Prisma only. No logic.
- `{feature}.schema.ts` — Zod schemas for I/O validation.
- `{feature}.types.ts` — TypeScript types/interfaces not in `@flowdesk/shared`.
- `{feature}.test.ts` — colocated unit tests (where useful).

Cross-cutting lives in `apps/api/src/shared/`:

- `middleware/` — auth, rate-limit, request-id, error-handler.
- `lib/` — prisma, redis, jwt, socket, llm-provider, logger, rate-limit-policies.
- `errors/` — typed error classes.

Frontend. `apps/web/src/features/{feature}/`:

- `components/` — feature-specific UI.
- `hooks/` — TanStack Query wrappers (`useQuery` / `useMutation`).
- `api.ts` — type-safe API client (Zod-validated request/response).
- `types.ts` — feature types.
- `index.ts` — public surface; only this file is imported by other features.

App shell primitives live in `apps/web/src/components/ui/` (shadcn-derived). Pages are thin route-level shells; they live in `apps/web/src/pages/`.

## Conventions

- **Zod everywhere** — every API boundary (`schema.ts`); every FE client response (`api.ts`).
- **Soft delete** — `deletedAt?` on User, Workspace, Task, TaskLabel, TaskLabelAssignment, Comment. Read paths auto-inject `deletedAt: null` via `softDeleteExtension`. Never `DELETE` rows in code; rely on Prisma extension. See `apps/api/src/shared/lib/prisma-extension.ts` and `SOFT_DELETE_MODEL_NAMES`.
- **Caching** — Redis with explicit TTL and an invalidation source-of-truth (the module that mutates owns the invalidation).
- **Auth** — JWT in httpOnly cookie; `assertMembership(workspaceId, userId)` middleware on every workspace-scoped mutation. Cross-workspace access → 401. See `ADR-003-auth-jwt-cookie.md` and `ADR-006-security-middleware-pattern.md`.
- **Pagination** — cursor envelope `{ data, nextCursor }` (see `packages/shared/src/pagination.ts`).
- **Logging** — structured JSON (`logger` in `apps/api/src/shared/lib/logger.ts`) with `requestId` / `userId` / `duration`.
- **No `any`** — see `AGENTS.md` anti-patterns.
- **No business logic in routes or repos** — see `AGENTS.md` anti-patterns.

## Realtime

Socket.IO namespaces: `/tasks`, `/notifications`, `/collab`. Auth middleware on `connection`. Rooms by resource: `workspace:{id}` and `task:{id}`. Memory-leak guard: `socket.leave()` in `disconnect`. The implementation spread:

- `apps/api/src/shared/lib/socket.ts` — auth middleware.
- `apps/api/src/modules/realtime/realtime.gateway.ts` — presence gateway (currently mounted on `/tasks`).

Reconnect client uses exponential backoff 1s → 30s with randomization 0.5, timeout 20s. See `apps/web/src/lib/socket.ts` and `ADR-004-realtime-socketio.md`.

## Database (Prisma 7)

- `packages/db/prisma/schema.prisma` — `provider = "prisma-client"`, custom `output = "../generated"`.
- `prisma.config.ts` at repo root defines the config (`env('DATABASE_URL')`, migrations path, etc.).
- All app code imports the generated client, not `@prisma/client`. The generated dir is gitignored.
- `PrismaPg` driver adapter pattern: `new PrismaClient({ adapter: new PrismaPg({ connectionString }), ... })`.
- Migration file naming: `YYYYMMDDhhmmss_<slug>/migration.sql`.

## Testing

Backend integration tests:

    pnpm --filter @flow-desk/api test:integration
    # run pnpm verify for current count

Test structure: `apps/api/tests/integration/{feature}.test.ts`. Each module gets its own file. Tests use the soft-delete extension unchanged.

Frontend E2E (Playwright):

    pnpm test:e2e
    # requires the docker stack up + a seeded DB

Frontend build:

    pnpm --filter @flow-desk/web build

## Git Hooks (lefthook)

- `pre-commit` (~15s) — secret scan + per-package TypeScript check for packages that have staged files.
- `pre-push` (~60–90s) — full typecheck + BE integration tests + web build.
- Offline equivalents: `pnpm check:secrets`, `pnpm --filter @flow-desk/<pkg> typecheck`, `pnpm verify`.

See `lefthook.yml` for full config. Bypass (last resort): `git commit --no-verify` / `git push --no-verify`. Never bypass the secret scan.

## Workflow

1. Pick the highest-priority unfinished item from `feature_list.json`. Set its `status` to `in_progress`. Only one `in_progress` at a time.
2. Read the linked ADR or spec from `docs/superpowers/specs/`.
3. Branch (optional; larger features): `git checkout -b <slug>`.
4. Work in small conventional commits. Hang the patches on the chosen feature.
5. Verify before claiming done: typecheck + tests + (where applicable) `pnpm --filter @flow-desk/web build`.
6. Update `feature_list.json` (status, evidence) and `claude-progress.md` (session log + verified state).
7. Update `RISKS.md` if a new risk surfaced; mirror it back when resolved.

Done = implementation done + verification ran + evidence recorded + `./init.sh` clean.

## Common Pitfalls

- `.env` keys in chat or commit messages → **rotate immediately**. Pre-commit secret scan blocks them in commits. Treat leaks as compromised the moment they reach scrollback.
- Container hostname is `postgres:5432`. Host-side local dev (`pnpm dev`) reads `localhost` from `.env`; the `pnpm dev` wrapper auto-rewrites the port in `.env` when it remaps to avoid host conflicts.
- `packages/db/generated/` is gitignored. If a checkout "loses" Prisma types, run `pnpm db:generate` first.
- `pnpm` 11 ignores `public-hoist-pattern` in `.npmrc`. Hoist settings live in `pnpm-workspace.yaml`. `prisma` and `@prisma/*` are public-hoisted on purpose for monorepo Docker builds.
- Long-running feature branches accumulate symlinks; `pnpm install --no-frozen-lockfile` clears them.
- Use `./scripts/docker-up.sh` instead of `docker compose up` directly — it auto-overrides conflicting host ports.
- `view transitions` and prisma-ESM require Node 22; older toolchains fail silently.
