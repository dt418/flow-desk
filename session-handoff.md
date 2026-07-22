# Session Handoff — FlowDesk

| Field        | Value                                                                             |
| ------------ | --------------------------------------------------------------------------------- |
| Last session | Review #4 attachments + GUEST write policy — 2026-07-22                           |
| Tip branch   | `main` @ origin (after push)                                                      |
| Code ship    | Stream uploads, no SVG, daily quota; GUEST read-only task/attachment mutations    |
| Docs ship    | RISKS R-06 mitigated; handoff                                                     |
| Status       | ROADMAP non-cut complete · **74** features `passing` · review polish #1–4 shipped |

## Verified state

| Check       | Detail                                                        |
| ----------- | ------------------------------------------------------------- |
| Startup     | `./init.sh` then `docker compose up -d` / `pnpm stack:up`     |
| Gate        | Stage files then `pnpm verify`                                |
| Agents      | `pnpm sync:agents` + `bash scripts/test-harness-structure.sh` |
| API unit    | **176**                                                       |
| Integration | **274**                                                       |
| Web unit    | **37**                                                        |
| Shared unit | **31**                                                        |
| Web         | http://localhost:5173                                         |
| API         | http://localhost:3000                                         |
| Demo        | `demo@flow-desk.app` / `demo1234` (after seed)                |

## Shipped this session

| Area      | What shipped                                                                |
| --------- | --------------------------------------------------------------------------- |
| Chat #1   | markRead bind; single emit; isPrivate forced false; task-channel authz      |
| Ops #2–3  | Metrics prod gate; DEPLOY.md; Redis AUTH optional; email-worker healthcheck |
| Attach #4 | Stream-to-disk; block SVG; 1 GiB/24h quota; safer download Content-Type     |
| GUEST     | `assertCanWriteWorkspace` on task mutations + attachment upload             |

| Follow-up | Detail                                                                  |
| --------- | ----------------------------------------------------------------------- |
| Optional  | Full private-channel membership ACL; bundled PgBouncer; web unit growth |
| Deploy    | `docs/DEPLOY.md` — set `METRICS_TOKEN`, `SENTRY_DSN` on shared hosts    |
| Product   | `/plan-feature` for DIR items                                           |

## Open / operator

| Kind      | Item                                                                        |
| --------- | --------------------------------------------------------------------------- |
| Deploy    | Real secrets + `METRICS_TOKEN` / `SENTRY_DSN`                               |
| Direction | CSV import, inbound webhooks, velocity, public API writes, real Slack slash |

## Commands

| Kind          | Commands                                                                      |
| ------------- | ----------------------------------------------------------------------------- |
| Stack         | `pnpm stack:up` / `stack:up-build` / `stack:down` / `stack:logs` / `stack:ps` |
| Prisma        | `pnpm db:push` / `db:migrate` / `db:seed` / `db:studio` / `db:reset`          |
| Build / check | `pnpm build` / `pnpm typecheck` / `pnpm test`                                 |
| Local dev     | `pnpm dev` / `pnpm dev:reset` / `pnpm dev:turbo`                              |
| Hooks / gate  | `pnpm setup:lefthook` / `pnpm check:secrets` / `pnpm verify`                  |
| Agents        | `pnpm sync:agents` / `bash scripts/test-harness-structure.sh`                 |
| Deploy        | `docs/DEPLOY.md`                                                              |
| Plans         | `plans/README.md`                                                             |
