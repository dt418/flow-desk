# Audit Plans Index

Generated: 2026-07-03 | Base commit: `732acb4` | Audit run: standard

Updated: 2026-07-11 | New audit run: standard | Base commit: `870c8ed`

Updated: 2026-07-15 | Residual audit (post 001–028 DONE) | Base commit: `081cbc6`

## Priority Order

| Plan | Finding                                                                            | Category    | Effort | Dependencies    | Status |
| ---- | ---------------------------------------------------------------------------------- | ----------- | ------ | --------------- | ------ |
| 009  | Email worker bugs (CORRECT-01,02,03)                                               | correctness | S      | —               | DONE   |
| 010  | Security hardening (ATTACH-01, HDR-01, RATE-01)                                    | security    | S      | —               | DONE   |
| 011  | Vite prod config (PERF-06, PERF-07)                                                | performance | S      | —               | DONE   |
| 012  | Board over-fetch (PERF-02)                                                         | performance | S      | —               | DONE   |
| 013  | Tech debt dedup (TECH-01, TECH-02)                                                 | tech-debt   | S      | —               | DONE   |
| 014  | `as any` casts (TECH-07)                                                           | tech-debt   | S      | —               | DONE   |
| 015  | Chat channel uniqueness (CORRECT-08)                                               | correctness | S      | —               | DONE   |
| 016  | Auth + membership caching (PERF-03, PERF-10)                                       | performance | M      | Redis available | DONE   |
| 017  | Code splitting + lazy loading (PERF-05)                                            | performance | M      | 011             | DONE   |
| 018  | API client validation (TECH-09)                                                    | tech-debt   | M      | —               | DONE   |
| 019  | Register/OAuth transactional (CORRECT-06)                                          | correctness | M      | —               | DONE   |
| 020  | Test pipeline — CI unit tests (TC-03)                                              | tests       | S      | —               | DONE   |
| 021  | Test pipeline — E2E realtime (TC-04)                                               | tests       | M      | 020             | DONE   |
| 022  | Realtime gateway tests (TC-01)                                                     | tests       | L      | 020             | DONE   |
| 023  | Auth + OAuth security gaps (SEC-01,02,07 + BUG-04,06)                              | security    | S–M    | —               | DONE   |
| 024  | Hot-path perf N+1 + addBulk + index (PERF-02..09)                                  | performance | M      | —               | DONE   |
| 025  | Tech-debt refactor (ARCH-01,02,03,05)                                              | tech-debt   | M      | —               | DONE   |
| 026  | Docs, DX, and `/api/v1` completeness (DX-01..04, DOCS-01..04, TASKS-01, DOCKER-01) | dx          | M      | —               | DONE   |
| 027  | Test coverage on critical paths (TEST-01,02,05,07,08)                              | tests       | M      | —               | DONE   |
| 028  | Production readiness (env unify, readiness, metrics token, headers)                | ops         | M      | —               | DONE   |
| 029  | Chat IDOR + typing auth + integration OAuth `Secure` cookies                       | security    | S      | —               | DONE   |
| 030  | Google OAuth 2FA + Slack signature + integration callback workspaceId              | security    | S–M    | —               | DONE   |
| 031  | Sprint list fix + type/sprintId filters + list/calendar/epic pagination            | bug         | M      | —               | DONE   |
| 032  | Webhook/automation SSRF + automation assign/column workspace checks                | security    | M      | —               | DONE   |
| 033  | Export cap/stream + email scheduler batch + rate-limit unit tests                  | perf        | M      | —               | DONE   |
| 034  | Sentry honesty + docker LLM default + docs + CSP report-only                       | dx          | S–M    | —               | DONE   |

## Dependency Graph

```
009–028 — DONE (historical)

029 (chat IDOR / typing / cookies)     — no deps
030 (oauth 2fa / slack / callback)     — no deps; parallel with 029
031 (sprint + pagination filters)      — no deps; parallel with 029/030
032 (SSRF + automation targets)        — no deps; parallel with 029–031
033 (export / scheduler / rate-limit)  — no hard deps; optional after 031 if touching task list
034 (ops/dx/docs/csp)                  — no deps; parallel with all
```

## Recommended Execution Order (2026-07-15 residual)

**Batch B — security first (parallel OK)**: 029, 030, 032  
**Batch C — product correctness**: 031  
**Batch D — scale + CI signal**: 033  
**Batch E — ops/docs**: 034

Suggested serial order if one executor: **029 → 030 → 032 → 031 → 033 → 034**.

## Previously Completed Plans

| Plan              | Status                    | Notes                                                                        |
| ----------------- | ------------------------- | ---------------------------------------------------------------------------- |
| 001-008           | DONE (as AUD-004-AUD-008) | Previous audit, 2026-06-28                                                   |
| kanban-sprint-1   | DONE                      | DnD a11y + click bubbling                                                    |
| kanban-sprint-1.5 | DONE                      | Optimistic race + overlay fade                                               |
| 009-015           | DONE                      | Batch 1 — email bugs, security, vite, board, dedup, enum, chat               |
| 016-020           | DONE                      | Batch 2 — auth cache, code splitting, API validation, register txn, CI tests |
| 021-022           | DONE                      | Batch 3 — E2E realtime, gateway tests                                        |
| 023-027           | DONE                      | 2026-07-11 audit batch                                                       |
| 028               | DONE                      | Production readiness 2026-07-15                                              |

## Findings considered and rejected (2026-07-15 residual audit)

- Markdown XSS via task description — DOMPurify + allowlist already in place (`apps/web/src/lib/sanitize.ts`).
- Board `take:50` + `taskCount` — plans 012/024 DONE; virtualized board still deferred.
- Refresh-token **family wipe** on reuse — product choice (see 2026-07-11 rejected BUG-05); atomic rotate still optional later.
- Full virtualized list/scroll — out of scope; 031 uses cursor Load-more / infinite query.
- OpenAPI generation — deferred (prior DOCS-02).
- Partial unique indexes migration for User.email etc. — still multi-table; out of scope.
- Enforcing CSP (non-report-only) without telemetry — deferred to post-034.
- Known DIR-01..08 product options (CSV import, inbound webhooks, velocity, public API writes, more integrations) — not defects; maintainer picks.

## Direction suggestions (carry-over, not plans)

- **DIR-01 / slash commands**: After plan 030 signature gate, implement real `/flowdesk` command → task service.
- **DIR-02**: Inbound webhook receiver (model after outgoing `Webhook`).
- **DIR-03**: CSV import (export ships; seed still titles import).
- **DIR-04**: Operator OAuth secrets for live Slack/GitLab (connect works after plan 030 callback fix).
- **DIR-05**: Velocity/throughput reports beyond burndown.
- **DIR-06**: Public API write surface beyond read-only `/api/v1`.
- **DIR-07**: Extra integrations (Linear/Notion) on existing `Integration` model.

## Plan files (open)

| File                                                                                 | Title                                              |
| ------------------------------------------------------------------------------------ | -------------------------------------------------- |
| [029-chat-idor-typing-oauth-cookies.md](./029-chat-idor-typing-oauth-cookies.md)     | Chat membership IDOR, typing auth, Secure cookies  |
| [030-oauth-2fa-slack-callback.md](./030-oauth-2fa-slack-callback.md)                 | Google 2FA, Slack HMAC, OAuth callback workspaceId |
| [031-sprint-filters-list-pagination.md](./031-sprint-filters-list-pagination.md)     | Sprint fix + filters + pagination                  |
| [032-ssrf-automation-targets.md](./032-ssrf-automation-targets.md)                   | SSRF guards + automation targets                   |
| [033-export-scheduler-ratelimit-tests.md](./033-export-scheduler-ratelimit-tests.md) | Export cap, scheduler batch, rate-limit tests      |
| [034-ops-dx-docs-csp.md](./034-ops-dx-docs-csp.md)                                   | Sentry, docker LLM, docs, CSP-RO                   |

## Executor note

Each plan is self-contained. Run:

```bash
git diff --stat 081cbc6..HEAD -- <in-scope paths from plan>
```

before starting. Prefer `pnpm verify` before commit. Do not use `--no-verify`.
