# Session Handoff — FlowDesk

| Field        | Value                                                                         |
| ------------ | ----------------------------------------------------------------------------- |
| Last session | Optional PgBouncer profile + PG_POOL_MAX (R-14) — 2026-07-22                  |
| Tip branch   | `main` @ origin                                                               |
| Code ship    | compose `pgbouncer` profile; `DB_HOST`/`PG_POOL_MAX`; Prisma `pg` Pool cap    |
| Docs ship    | `docs/DEPLOY.md` §5; RISKS R-14; `.env.example`                               |
| Status       | ROADMAP non-cut complete · **74** features `passing` · review polish complete |

## Verified state

| Check       | Detail                            |
| ----------- | --------------------------------- |
| Startup     | `./init.sh` then `pnpm stack:up`  |
| Gate        | `pnpm verify`                     |
| Agents      | `pnpm sync:agents`                |
| API unit    | **176**                           |
| Integration | **275**                           |
| Web unit    | **39**                            |
| Shared unit | **31**                            |
| Web         | http://localhost:5173             |
| API         | http://localhost:3000             |
| Demo        | `demo@flow-desk.app` / `demo1234` |

## Shipped this session

| Area            | What shipped                                                                          |
| --------------- | ------------------------------------------------------------------------------------- |
| PgBouncer (opt) | Compose profile `pgbouncer` (`edoburu/pgbouncer` transaction mode, host **6432**)     |
| Pool cap        | `PG_POOL_MAX` → Prisma `@prisma/adapter-pg` Pool `max` (default **10** in compose)    |
| DB host switch  | `DB_HOST` / `DB_PORT` for api + email-worker `DATABASE_URL` (default `postgres:5432`) |
| Prior           | Private channel ACL + UI; CSP enforce; uploads/GUEST; metrics/JWT gates               |

| Follow-up | Detail                                                                      |
| --------- | --------------------------------------------------------------------------- |
| Optional  | Web unit growth; product DIR (CSV import, inbound webhooks, Slack slash, …) |
| Deploy    | `docs/DEPLOY.md`; migrate **direct** to Postgres when app uses PgBouncer    |

## Open / operator

| Kind      | Item                                                              |
| --------- | ----------------------------------------------------------------- |
| Deploy    | Secrets + `METRICS_TOKEN` / `SENTRY_DSN`; `prisma migrate deploy` |
| Direction | CSV import, inbound webhooks, velocity, public API writes, Slack  |

## Commands

| Kind          | Commands                                                                         |
| ------------- | -------------------------------------------------------------------------------- |
| Stack         | `pnpm stack:up` / `stack:up-build` / `stack:down` / `stack:logs` / `stack:ps`    |
| PgBouncer     | `docker compose --profile pgbouncer up -d` + `DB_HOST=pgbouncer` `PG_POOL_MAX=5` |
| Prisma        | `pnpm db:push` / `db:migrate` / `db:migrate-deploy` / `db:seed`                  |
| Build / check | `pnpm build` / `pnpm typecheck` / `pnpm test`                                    |
| Local dev     | `pnpm dev` / `pnpm dev:reset` / `pnpm dev:turbo`                                 |
| Hooks / gate  | `pnpm setup:lefthook` / `pnpm check:secrets` / `pnpm verify`                     |
| Agents        | `pnpm sync:agents` / `bash scripts/test-harness-structure.sh`                    |
| Plans         | `plans/README.md`                                                                |
| Deploy        | `docs/DEPLOY.md`                                                                 |
