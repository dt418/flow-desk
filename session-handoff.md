# Session Handoff — FlowDesk

| Field        | Value                                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| Last session | Security/ops audit 029–034 + review fixes — 2026-07-15                                                   |
| Tip commit   | `951607a` on `main` (pushed)                                                                             |
| Code ship    | `4099a0b` fix(security): ship audit 029–034 and review hardening                                         |
| Docs ship    | `da2418b` harness · `7158120`/`951607a` handoff format                                                   |
| Status       | ROADMAP non-cut complete · **74** features `passing` (68 product + AUD-029…034) · plans **001–034 DONE** |

## Verified state

| Check       | Detail                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------- |
| Startup     | `./init.sh` then `docker compose up -d` / `pnpm stack:up`                                 |
| Gate        | Stage files then `pnpm verify` (or typecheck + unit + integration + build + format:check) |
| API unit    | **170**                                                                                   |
| Integration | **270**                                                                                   |
| Web unit    | **37**                                                                                    |
| Shared unit | **31**                                                                                    |
| Web         | http://localhost:5173                                                                     |
| API         | http://localhost:3000                                                                     |
| Demo        | `demo@flow-desk.app` / `demo1234` (after seed)                                            |

## Shipped this session

Audit plans **029–034** plus review follow-ups.

| Plan    | Area     | What shipped                                                                                    |
| ------- | -------- | ----------------------------------------------------------------------------------------------- |
| AUD-029 | Security | Chat always requires workspace membership; typing only after join; Secure OAuth cookies         |
| AUD-030 | Security | Google OAuth 2FA via httpOnly cookie; Slack request signature; cookie-only callback workspaceId |
| AUD-031 | Product  | `sprintId` / `type` task filters; list, calendar, epic, sprint load-more / infinite scroll      |
| AUD-032 | Security | Outbound SSRF guard + DNS-pinned fetch; automation assign/column stay in-workspace              |
| AUD-033 | Ops      | Export hard-cap 10k → 413 + FE toast; email scheduler batching; rate-limit unit tests           |
| AUD-034 | Ops      | Sentry package, required docker `LLM_API_KEY`, CSP report-only, docs accuracy                   |

| Follow-up        | Detail                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| Review hardening | IPv6/IMDS/CGNAT blocklist; calendar next-page error gate; export blob; Load more                       |
| Harness          | `feature_list` AUD-029…034 · `RISKS` R-45…R-47 · `TASKS` appendix · `plans/README` · `claude-progress` |

## Open / operator

| Kind      | Item                                                                                        |
| --------- | ------------------------------------------------------------------------------------------- |
| Deploy    | Real `LLM_API_KEY`, `JWT_SECRET`; optional `METRICS_TOKEN` / `SENTRY_DSN` / OAuth secrets   |
| Direction | CSV import, inbound webhooks, velocity reports, public API writes, real Slack slash actions |

## Commands

| Kind          | Commands                                                                               |
| ------------- | -------------------------------------------------------------------------------------- |
| Stack         | `pnpm stack:up` / `stack:up-build` / `stack:down` / `stack:logs` / `stack:ps`          |
| Prisma        | `pnpm db:push` / `db:migrate` / `db:seed` / `db:studio` / `db:reset`                   |
| Build / check | `pnpm build` / `pnpm typecheck` / `pnpm test`                                          |
| Local dev     | `pnpm dev` (infra + migrate + seed + hot reload) / `pnpm dev:reset` / `pnpm dev:turbo` |
| Hooks / gate  | `pnpm setup:lefthook` / `pnpm check:secrets` / `pnpm verify`                           |
| Plans         | `plans/README.md`                                                                      |
