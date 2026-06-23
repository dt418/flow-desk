# FlowDesk — Agent Instructions

This repository is designed for long-running coding-agent work. The goal is not to maximize raw code output. The goal is to leave the repo in a state where the next session can continue without guessing.

## Tech Stack

| Layer      | Technology                                                 |
| ---------- | ---------------------------------------------------------- |
| Frontend   | React 18 + Vite + TypeScript + Tailwind CSS v4 + shadcn/ui |
| Backend    | Hono + Node.js + TypeScript                                |
| Database   | PostgreSQL 16                                              |
| Cache      | Redis 7                                                    |
| ORM        | Prisma                                                     |
| Realtime   | Socket.IO (Redis adapter)                                  |
| Auth       | JWT in httpOnly cookie (bcrypt + Google OAuth)             |
| AI         | OpenAI-compatible (custom baseUrl + model)                 |
| Deployment | Docker Compose (self-hosted)                               |

## Startup Workflow

Before writing code:

1. Confirm the working directory with `pwd` (expect `/home/thanh/flow-desk`).
2. Read `claude-progress.md` for the latest verified state and next step.
3. Read `feature_list.json` and choose the highest-priority unfinished feature.
4. Review recent commits with `git log --oneline -5`.
5. Run `./init.sh`.
6. Run the required smoke or end-to-end verification before starting new work.

If baseline verification is already failing, fix that first. Do not stack new feature work on top of a broken starting state.

## Working Rules

- Work on **one feature at a time** (only one `in_progress` in `feature_list.json`).
- Do **not** mark a feature complete just because code was added.
- Keep changes within the selected feature scope unless a blocker forces a narrow supporting fix.
- Do **not** silently change verification rules during implementation.
- Prefer durable repo artifacts over chat summaries.

## Engineering Pipeline (Non-Negotiable)

Before writing any feature code, ensure artifacts exist:

```
PRD.md          → Problem, goals, non-goals, user stories, success metrics
ADR-XXX.md      → Context, decision, rationale, alternatives rejected, consequences
TASKS.md        → Epics → Stories → Tasks (with effort estimates)
ACCEPTANCE.md   → Concrete, testable acceptance criteria per story
RISKS.md        → Risk, likelihood, impact, mitigation for each identified risk
```

If any artifact is incomplete, **stop and request it before proceeding**.

## Architecture Standards

### Backend (Hono + Node.js)

```
apps/api/src/modules/{feature}/
  {feature}.routes.ts      # HTTP + WebSocket route registration
  {feature}.service.ts     # Business logic, orchestration
  {feature}.repository.ts  # DB access (Prisma) — no business logic
  {feature}.schema.ts      # Zod schemas for I/O validation
  {feature}.types.ts       # TypeScript types/interfaces
  {feature}.test.ts        # Unit + integration tests
apps/api/src/shared/
  middleware/              # auth, rate-limit, logging, error handler
  lib/                     # prisma client, redis client, logger, llm-provider
  errors/                  # typed error classes
```

### Frontend (React + Vite)

```
apps/web/src/features/{feature}/
  components/              # Feature-specific UI
  hooks/                   # useQuery / useMutation wrappers
  api.ts                   # Type-safe API client
  types.ts
  index.ts                 # Public API of the feature
apps/web/src/components/ui/  # Shared, headless UI primitives
apps/web/src/lib/            # queryClient, auth, socket, utils
apps/web/src/pages/          # Route-level components only (thin shells)
```

### Required Patterns

- **Zod** for all input validation.
- **Centralized error handler** — no raw `try/catch` leaking to routes.
- **Structured logging** (JSON, with `requestId`, `userId`, `duration`).
- **JWT** auth as middleware, never inline in handlers.
- **Rate limiting** per route category (auth: strict, API: moderate).
- **Redis caching** with explicit TTL and invalidation strategy.
- **TanStack Query** for all server state — no manual `useEffect` fetch.
- **Optimistic updates** on mutations where UX demands it.
- **Type-safe API client** — request/response types from Zod schemas.

### Prisma Rules

- Every model: `id` (cuid), `createdAt`, `updatedAt`, `deletedAt?` (soft delete).
- `@@index` for every FK and common filter field.
- `@@unique` for business-level uniqueness.
- Explicit `@relation` names on both sides.
- Never drop columns in a single migration — deprecate first.
- Additive migrations only in production.

### Socket.IO Rules

- Namespaces by domain: `/tasks`, `/notifications`, `/collab`.
- Rooms by resource ID: `workspace:{id}`, `task:{id}`.
- Auth middleware validates JWT on `connection`, disconnects on failure.
- Memory leak guard: `socket.leave()` in `disconnect`, clean up intervals.

## Required Artifacts

- `feature_list.json` — source of truth for feature state.
- `claude-progress.md` — session log + current verified status.
- `init.sh` — standard startup + verification path.
- `session-handoff.md` — compact handoff for larger sessions.

## Secrets Policy

- **Never paste API keys, tokens, or credentials into chat, commit messages, or PR descriptions.** Treat them as toxic to conversation history.
- All secrets live in `.env` (gitignored) or `.env.local` (gitignored). The `LLM_API_KEY`, `JWT_SECRET`, `GOOGLE_CLIENT_SECRET`, `AWS_*` values must never appear in any committed file.
- A pre-commit hook at `.githooks/pre-commit` enforces this:
  - Blocks staged files matching `.env*` and common credential paths (PEM, `id_rsa`, `service-account*.json`, etc).
  - Greps staged content for high-confidence secret patterns (`sk-…`, `sk-ant-…`, `AIza…`, `ghp_…`, `AKIA…`, JWT, private-key blocks, `LLM_API_KEY=…`).
- Hooks are installed automatically by `./init.sh` (calls `pnpm setup:lefthook`). Configuration in `lefthook.yml`. To install manually: `pnpm setup:lefthook`. To re-run the secret check without committing: `pnpm check:secrets`. To run all gates locally: `pnpm verify`.
- **pre-commit**: secret scan (`.githooks/pre-commit`) + per-package typecheck (web/api/shared) — runs in ~15s.
- **pre-push**: full typecheck + BE integration tests + web build — runs in ~60-90s.
- If a real key is ever exposed, **rotate it at the provider immediately**. The key is compromised the moment it appears in a chat or terminal scrollback.

## Definition of Done

A feature is done **only when all** are true:

- the target behavior is implemented.
- the required verification actually ran.
- evidence is recorded in `feature_list.json` or `claude-progress.md`.
- the repository remains restartable from `./init.sh`.

## End of Session

Before ending:

1. Update `claude-progress.md` with session record.
2. Update `feature_list.json` (status, evidence).
3. Record unresolved risk/blocker.
4. Commit with descriptive message once work is in safe state.
5. Leave repo clean enough for next session to run `./init.sh` immediately.

## Anti-Patterns (Never)

- ❌ Jump to code without artifacts.
- ❌ Use `any` in TypeScript.
- ❌ Mix business logic into routes or repositories.
- ❌ Leave error paths unhandled.
- ❌ Deploy breaking DB changes in a single migration.
- ❌ Poll where WebSocket/SSE works.
- ❌ Store secrets in env vars accessible to frontend bundle.
- ❌ Praise approaches that create debt. Challenge them.

## Golden Rule

> Simple, boring, and correct beats clever every time.
> If an architecture decision needs a long explanation to justify it, it's probably wrong.
