# Session Handoff — FlowDesk

| Field        | Value                                                                               |
| ------------ | ----------------------------------------------------------------------------------- |
| Last session | Private chat channel ACL + CSP enforce — 2026-07-22                                 |
| Tip branch   | `main` @ origin (after push)                                                        |
| Code ship    | `ChatChannelMember` private ACL; member APIs; socket join; nginx CSP enforcing      |
| Docs ship    | handoff + progress                                                                  |
| Status       | ROADMAP non-cut complete · **74** features `passing` · review polish round complete |

## Verified state

| Check       | Detail                            |
| ----------- | --------------------------------- |
| Startup     | `./init.sh` then `pnpm stack:up`  |
| Gate        | `pnpm verify`                     |
| Agents      | `pnpm sync:agents`                |
| API unit    | **176**                           |
| Integration | **275**                           |
| Web unit    | **37**                            |
| Shared unit | **31**                            |
| Web         | http://localhost:5173             |
| API         | http://localhost:3000             |
| Demo        | `demo@flow-desk.app` / `demo1234` |

## Shipped this session

| Area         | What shipped                                                                   |
| ------------ | ------------------------------------------------------------------------------ |
| Private chat | Model + migration; list/validate/socket; `GET/POST/DELETE .../members`         |
| CSP          | nginx `Content-Security-Policy` enforcing                                      |
| Prior polish | Chat markRead; metrics prod gate; uploads stream/SVG/quota; GUEST write policy |

| Follow-up | Detail                                                 |
| --------- | ------------------------------------------------------ |
| Optional  | Private-channel UI; PgBouncer service; web unit growth |
| Deploy    | `docs/DEPLOY.md`; run migrations on deploy             |

## Open / operator

| Kind      | Item                                                                   |
| --------- | ---------------------------------------------------------------------- |
| Deploy    | Secrets + `METRICS_TOKEN` / `SENTRY_DSN`; `prisma migrate deploy`      |
| Direction | CSV import, inbound webhooks, velocity, public API writes, Slack slash |

## Commands

| Kind   | Commands                                                                      |
| ------ | ----------------------------------------------------------------------------- |
| Stack  | `pnpm stack:up` / `stack:up-build` / `stack:down` / `stack:logs` / `stack:ps` |
| Prisma | `pnpm db:push` / `db:migrate` / `db:migrate-deploy` / `db:seed`               |
| Gate   | `pnpm verify`                                                                 |
| Agents | `pnpm sync:agents` / `bash scripts/test-harness-structure.sh`                 |
| Deploy | `docs/DEPLOY.md`                                                              |
