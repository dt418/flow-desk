# Session Handoff — FlowDesk

**Last session**: Security/ops audit 029–034 + review fixes — 2026-07-15  
**Tip commit**: `4099a0b` on `main` (pushed)

**Status**: Product ROADMAP non-cut items complete. `feature_list.json` **74** features `passing` (68 product + AUD-029…AUD-034). Plans **001–034 DONE**.

## Verified state

- Stack: `./init.sh` then `docker compose up -d` / `pnpm stack:up`
- Gate: stage files then `pnpm verify` (or typecheck + unit + integration + build + format:check)
- Counts: api unit **170**, integration **270**, web **37**, shared **31**
- Web: http://localhost:5173 · API: http://localhost:3000
- Demo: `demo@flow-desk.app` / `demo1234` (after seed)

## Shipped this session (029–034 + review)

| Area         | Highlights                                                                         |
| ------------ | ---------------------------------------------------------------------------------- |
| Security     | Chat IDOR, OAuth 2FA cookie, Slack HMAC, DNS-pinned SSRF, automation target checks |
| Product bugs | Sprint `/api` + filters, list/calendar/epic/sprint pagination                      |
| Ops          | Export 413, scheduler batch, Sentry, docker LLM required, CSP-RO                   |

Artifacts: `plans/README.md`, `RISKS.md` R-45…R-47 mitigated, `TASKS.md` appendix, `claude-progress.md` session log.

## Open / operator

- Set real `LLM_API_KEY`, `JWT_SECRET`, optional `METRICS_TOKEN` / `SENTRY_DSN` / OAuth secrets for live deploy
- Direction (not planned): CSV import, inbound webhooks, velocity reports, public API writes, real Slack slash actions

## Commands

- Stack: `pnpm stack:up` / `stack:up-build` / `stack:down` / `stack:logs` / `stack:ps`
- Prisma: `pnpm db:push` / `db:migrate` / `db:seed` / `db:studio` / `db:reset`
- Build/typecheck/test: `pnpm build` / `pnpm typecheck` / `pnpm test`
- Local dev: `pnpm dev` (one command — infra + migrate + seed + hot reload) / `pnpm dev:reset` (drop DB + dev) / `pnpm dev:turbo` (raw turbo, no host port patching)
- Hooks: `pnpm setup:lefthook` / `pnpm check:secrets` / `pnpm verify`
- Plans index: `plans/README.md`
