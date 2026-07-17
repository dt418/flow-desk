# Session Handoff — FlowDesk

**Last session**: Security/ops audit 029–034 + review fixes — 2026-07-15

**Status**: Product ROADMAP non-cut items shipped (68/68 feature_list passing). Plans **001–034 DONE**.

## Verified state

- Stack: `./init.sh` then `docker compose up -d` / `pnpm stack:up`
- Gate: `pnpm verify` after staging (or typecheck/lint/test/build/format:check)
- Web: http://localhost:5173 · API: http://localhost:3000
- Demo: `demo@flow-desk.app` / `demo1234` (after seed)

## Shipped this session (029–034 + review)

| Area         | Highlights                                                                         |
| ------------ | ---------------------------------------------------------------------------------- |
| Security     | Chat IDOR, OAuth 2FA cookie, Slack HMAC, DNS-pinned SSRF, automation target checks |
| Product bugs | Sprint `/api` + filters, list/calendar/epic/sprint pagination                      |
| Ops          | Export 413, scheduler batch, Sentry, docker LLM required, CSP-RO                   |

## Open / operator

- Set real `LLM_API_KEY`, `JWT_SECRET`, optional `METRICS_TOKEN` / `SENTRY_DSN` / OAuth secrets
- Direction (not planned): CSV import, inbound webhooks, velocity reports, public API writes, real Slack slash actions

## Commands

- Dev: `pnpm dev` / `pnpm dev:reset`
- Verify: `pnpm verify` · secrets: `pnpm check:secrets`
- Plans index: `plans/README.md`
