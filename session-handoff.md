# Session Handoff — FlowDesk

| Field        | Value                                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| Last session | plan-feature v2.2 + agent team harness — 2026-07-18                                                      |
| Tip branch   | `main` @ origin (pending commit: plan-feature v2.2 + changelogs)                                         |
| Code ship    | plan-feature v2.2: Superpowers skill orchestration gaps closed                                            |
| Docs ship    | AGENTS.md change log + claude-progress.md + session-handoff.md updated                                   |
| Status       | ROADMAP non-cut complete · **74** features `passing` · plans **001–034 DONE** · plan-feature v2.2 ready  |

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

Agent/skill harness from [revfactory/harness](https://github.com/revfactory/harness) (no product feature change).

| Area     | What shipped                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------- |
| Agents   | `.claude/agents/fd-{explorer,implementer,security,qa,docs}.md`                                     |
| Skills   | `flowdesk-team`, `flowdesk-implement`, `flowdesk-security-review`, `flowdesk-qa`, `harness` (meta) |
| Adapters | Multi-host symlinks via `pnpm sync:agents`; slash `/flowdesk-team`                                 |
| Docs     | AGENTS.md harness pointer; adapters.md multi-skill; gitignore whitelist                            |

| Follow-up | Detail                                                               |
| --------- | -------------------------------------------------------------------- |
| Use team  | `/flowdesk-team` or skill `flowdesk-team` for multi-role ship/review |
| Product   | Still `/plan-feature` for ROADMAP / feature_list feature work        |
| Evolve    | Skill `harness` to reconfigure agents/skills after feedback          |

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
