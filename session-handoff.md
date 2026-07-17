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

## Shipped this session

Audit plans **029–034** plus review follow-ups. Commit: `4099a0b`.

| Plan    | Area     | What shipped                                                                                    |
| ------- | -------- | ----------------------------------------------------------------------------------------------- |
| AUD-029 | Security | Chat always requires workspace membership; typing only after join; Secure OAuth cookies         |
| AUD-030 | Security | Google OAuth 2FA via httpOnly cookie; Slack request signature; cookie-only callback workspaceId |
| AUD-031 | Product  | `sprintId` / `type` task filters; list, calendar, epic, sprint load-more / infinite scroll      |
| AUD-032 | Security | Outbound SSRF guard + DNS-pinned fetch; automation assign/column stay in-workspace              |
| AUD-033 | Ops      | Export hard-cap 10k → 413 + FE toast; email scheduler batching; rate-limit unit tests           |
| AUD-034 | Ops      | Sentry package, required docker `LLM_API_KEY`, CSP report-only, docs accuracy                   |

**Review follow-ups** (same ship): IPv6/IMDS/CGNAT blocklist, calendar next-page error gate, export blob download, epic/sprint Load more.

**Harness**: `feature_list.json` AUD-029…034 · `RISKS.md` R-45…R-47 mitigated · `TASKS.md` appendix · `plans/README.md` · `claude-progress.md`

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
