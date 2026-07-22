# Session Handoff — FlowDesk

| Field        | Value                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------- |
| Last session | Review #2–3 lite: deploy runbook, metrics prod gate, Redis AUTH, worker health — 2026-07-22                 |
| Tip branch   | `main` @ origin (`25df9b2` + handoff sync)                                                                  |
| Code ship    | Chat #1 + ops: `/metrics` 503 w/o token in prod; JWT entropy; Redis AUTH optional; email-worker healthcheck |
| Docs ship    | `docs/DEPLOY.md`; README / `.env.example`; RISKS R-14 note                                                  |
| Status       | ROADMAP non-cut complete · **74** features `passing` · review polish #1 done, #2–3 lite done                |

## Verified state

| Check       | Detail                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------- |
| Startup     | `./init.sh` then `docker compose up -d` / `pnpm stack:up`                                 |
| Gate        | Stage files then `pnpm verify` (or typecheck + unit + integration + build + format:check) |
| Agents      | `pnpm sync:agents` + `bash scripts/test-harness-structure.sh`                             |
| API unit    | **176**                                                                                   |
| Integration | **270**                                                                                   |
| Web unit    | **37**                                                                                    |
| Shared unit | **31**                                                                                    |
| Web         | http://localhost:5173                                                                     |
| API         | http://localhost:3000                                                                     |
| Demo        | `demo@flow-desk.app` / `demo1234` (after seed)                                            |

## Shipped this session

| Area   | What shipped                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------------ |
| Chat#1 | markRead bind; single `message:read` emit; `isPrivate` forced false; task-channel membership+task bind |
| Ops#2  | Production metrics closed without token; JWT low-entropy reject; `docs/DEPLOY.md`                      |
| Ops#3  | Optional Redis AUTH in compose; email-worker healthcheck; pool/PgBouncer/backup docs                   |

| Follow-up | Detail                                                                        |
| --------- | ----------------------------------------------------------------------------- |
| Next      | Review #4 attachment stream/SVG/quota; full private-channel ACL; GUEST policy |
| Deploy    | Operators: set `METRICS_TOKEN`, `SENTRY_DSN`; follow `docs/DEPLOY.md`         |
| Product   | `/plan-feature` for DIR items (CSV import, velocity, API write, Slack slash)  |

## Open / operator

| Kind      | Item                                                                                        |
| --------- | ------------------------------------------------------------------------------------------- |
| Deploy    | Real `JWT_SECRET` / `LLM_API_KEY` / `POSTGRES_PASSWORD`; `METRICS_TOKEN` + `SENTRY_DSN`     |
| Direction | CSV import, inbound webhooks, velocity reports, public API writes, real Slack slash actions |

## Commands

| Kind          | Commands                                                                               |
| ------------- | -------------------------------------------------------------------------------------- |
| Stack         | `pnpm stack:up` / `stack:up-build` / `stack:down` / `stack:logs` / `stack:ps`          |
| Prisma        | `pnpm db:push` / `db:migrate` / `db:seed` / `db:studio` / `db:reset`                   |
| Build / check | `pnpm build` / `pnpm typecheck` / `pnpm test`                                          |
| Local dev     | `pnpm dev` (infra + migrate + seed + hot reload) / `pnpm dev:reset` / `pnpm dev:turbo` |
| Hooks / gate  | `pnpm setup:lefthook` / `pnpm check:secrets` / `pnpm verify`                           |
| Agents        | `pnpm sync:agents` / `bash scripts/test-harness-structure.sh`                          |
| Deploy        | `docs/DEPLOY.md`                                                                       |
| Plans         | `plans/README.md`                                                                      |
