# Session Handoff — FlowDesk

**Last session**: 028 (`pnpm dev` one-command wrapper + docker cleanup) — 2026-07-07

**Status**: 35 features + F7 + E2E + kanban-sprint-1 + audit-002 all passing. 97/97 unit tests pass. Realistic seed data loaded (15 users, 6 workspaces, 51 tasks, 60 subtasks, 199 comments, 120 notifications, 16 attachments, 26 labels).

**Session 024 — test fixes**:

- Fixed 7 broken unit tests + docker inspect error from audit batch changes. `tests/setup/db.ts` replaced docker inspect with pg_isready native detection. `chat.message.test.ts` added safeEmit/emitToUser mocks. `chat.test.ts` updated duplicate name test for P2002 unique constraint. `notification-email.test.ts` assertion SENT→PENDING. `email-worker.test.ts` added bullmq Queue getJob mock. `scheduler.test.ts` added emailJob.create mock. 97/97 unit tests pass.

**Verified state** (re-run `./init.sh` + `docker compose up -d`):

- `pnpm typecheck` → exit 0
- `pnpm --filter @flow-desk/api test:unit` → 97/97 pass
- `pnpm --filter @flow-desk/web build` → exit 0
- `curl http://localhost:3000/api/health` → 200
- Login `demo@flow-desk.app / demo1234` works, sees 6 workspaces

**Risks remaining**: R-24 (ai-001 LLM latency UX) is the only material carry-forward.

**Auth-002** still blocked on real Google OAuth credentials.

**Open TODOs**: 8 audit plans remaining (001-008: stored XSS, cross-workspace IDOR, refresh token rotation, websocket IDOR, soft-delete extension gaps, JWT/rate-limit hardening, digest/pagination, performance/redis).

## Verified Now

- What is currently working:
  - 35 features + F7 + E2E + kanban-sprint-1 + audit-002 all passing (`feature_list.json`)
  - Stack up: `docker compose up -d` from `/home/thanh/flow-desk`
  - Web at http://localhost:5173, API at http://localhost:3000
  - Demo creds: `demo@flow-desk.app` / `demo1234`

## Commands

- Stack: `pnpm stack:up` / `stack:up-build` / `stack:down` / `stack:logs` / `stack:ps`
- Prisma: `pnpm db:push` / `db:migrate` / `db:seed` / `db:studio` / `db:reset`
- Build/typecheck/test: `pnpm build` / `pnpm typecheck` / `pnpm test`
- Local dev: `pnpm dev` (one command — infra + migrate + seed + hot reload) / `pnpm dev:reset` (drop DB + dev) / `pnpm dev:turbo` (raw turbo, no host port patching)
- Hooks: `pnpm setup:lefthook` / `pnpm check:secrets` / `pnpm verify`
