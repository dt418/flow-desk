# Session Handoff — FlowDesk

| Field        | Value                                                                                                                 |
| ------------ | --------------------------------------------------------------------------------------------------------------------- |
| Last session | Harness hygiene: untrack smoke artifacts, tip sync, push — 2026-07-18                                                 |
| Tip branch   | `main` @ origin (after push of this commit)                                                                           |
| Code ship    | Agents/skills harness + plan-feature v2.2 + Phase 6 test script (no product feature change)                           |
| Docs ship    | handoff tip; untrack `_workspace`/test-results; gitignore; structure test script                                      |
| Status       | ROADMAP non-cut complete · **74** features `passing` · plans **001–034 DONE** · harness ready · plan-feature **v2.2** |

## Verified state

| Check       | Detail                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------- |
| Startup     | `./init.sh` then `docker compose up -d` / `pnpm stack:up`                                 |
| Gate        | Stage files then `pnpm verify` (or typecheck + unit + integration + build + format:check) |
| Agents      | `pnpm sync:agents` + `bash scripts/test-harness-structure.sh`                             |
| API unit    | **170**                                                                                   |
| Integration | **270**                                                                                   |
| Web unit    | **37**                                                                                    |
| Shared unit | **31**                                                                                    |
| Web         | http://localhost:5173                                                                     |
| API         | http://localhost:3000                                                                     |
| Demo        | `demo@flow-desk.app` / `demo1234` (after seed)                                            |

## Shipped this session

| Area         | What shipped                                                                                         |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| Harness      | `.claude/agents/fd-*`, skills `flowdesk-team` / implement / security / qa / `harness` meta           |
| plan-feature | **v2.2** Superpowers dispatch (worktrees, parallel agents, receiving-code-review)                    |
| Validation   | Phase 6 structure/dry-run/skill-smoke on chat; findings still match current chat code                |
| Hygiene      | Stop tracking `_workspace/**` + e2e/test-results artifacts; gitignore; durable structure test script |

| Follow-up | Detail                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------- |
| Use team  | `/flowdesk-team` or skill `flowdesk-team` for multi-role ship/review                                                      |
| Product   | Still `/plan-feature` for ROADMAP / feature_list feature work                                                             |
| Residual  | Chat: `isPrivate` cosmetic ACL; `getOrCreateTaskChannel` no userId; markRead message bind (low/medium, not blocking ship) |
| Deploy    | Real `LLM_API_KEY`, `JWT_SECRET`; optional metrics/Sentry/OAuth                                                           |

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
| Agents        | `pnpm sync:agents` / `bash scripts/test-harness-structure.sh`                          |
| Plans         | `plans/README.md`                                                                      |
