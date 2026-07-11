# Audit Plans Index

Generated: 2026-07-03 | Base commit: `732acb4` | Audit run: standard

Updated: 2026-07-11 | New audit run: standard | Base commit: `870c8ed`

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
| 025  | Tech-debt refactor (ARCH-01,02,03,05)                                              | tech-debt   | M      | —               | TODO   |
| 026  | Docs, DX, and `/api/v1` completeness (DX-01..04, DOCS-01..04, TASKS-01, DOCKER-01) | dx          | M      | —               | TODO   |
| 027  | Test coverage on critical paths (TEST-01,02,05,07,08)                              | tests       | M      | —               | TODO   |

## Dependency Graph

```
009 (email bugs)         — no deps
010 (security)           — no deps
011 (vite prod)          — no deps
012 (board fetch)        — no deps
013 (dedup)              — no deps
014 (as any)             — no deps
015 (chat uniqueness)    — no deps
016 (auth cache)         — no deps
017 (code splitting)     — depends on 011
018 (API validation)     — no deps
019 (register txn)       — no deps
020 (CI unit tests)      — no deps
021 (E2E realtime)       — depends on 020
022 (realtime tests)     — depends on 020
023 (auth security)      — no deps
024 (perf)               — no deps (but PERF-02 step 2 makes chat channel shape change; TEST-07 in 027 must read post-024 code)
025 (tech-debt)          — no deps
026 (docs/dx/api)        — no deps (Dockerfile fix in step 9 is the only env-touching piece)
027 (tests)              — no deps, but if 024 lands first, TEST-07 in 027 reads the new chat shape
```

## Recommended Execution Order

**Batch 1** (parallel, S effort, no deps): 009, 010, 011, 012, 013, 014, 015
**Batch 2** (parallel, M effort): 016, 017, 018, 019, 020
**Batch 3** (after 020): 021, 022

**Batch A — 2026-07-11 audit** (parallel, all S/M, no inter-deps): 023, 024, 025, 026, 027
**Order suggestion within Batch A**: 024 first (so the test wiring in
027 reflects the post-024 chat shape), then 023, 025, 026, 027 last.
But any order is fine — all 5 are independent.

## Previously Completed Plans

| Plan              | Status                    | Notes                                                                        |
| ----------------- | ------------------------- | ---------------------------------------------------------------------------- |
| 001-008           | DONE (as AUD-004-AUD-008) | Previous audit, 2026-06-28                                                   |
| kanban-sprint-1   | DONE                      | DnD a11y + click bubbling                                                    |
| kanban-sprint-1.5 | DONE                      | Optimistic race + overlay fade                                               |
| 009-015           | DONE                      | Batch 1 — email bugs, security, vite, board, dedup, enum, chat               |
| 016-020           | DONE                      | Batch 2 — auth cache, code splitting, API validation, register txn, CI tests |
| 021-022           | DONE                      | Batch 3 — E2E realtime, gateway tests                                        |

## Findings considered and rejected (2026-07-11 audit)

- BUG-05 (refresh-token rotation no reuse-detection) — settled
  design choice; current behavior is acceptable for the
  portfolio-audience product.
- SEC-03 full fix (partial unique indexes on `User.email`,
  `Workspace.slug`, `ApiKey.hashedKey`, `Integration @@unique`) —
  multi-table migration with concurrent index creation. The
  register-handler fix in plan 023 is the smallest change that closes
  the user-visible leak; full migration is out of scope.
- PERF-01 (comment tree drops replies N+1) — actual UI uses lazy
  per-comment fetch; existing behavior intentional.
- PERF-04 full virtualized scroll rework — out of scope; the
  `taskCount` field added in plan 024 is the data prerequisite for
  a future FE rewrite.
- PERF-10/11/12 (bundle split, dnd-kit leak, comment \_count
  subqueries) — LOW-confidence perf findings; skipped pending real
  measurement (run `pnpm build` with `--analyze` and re-audit).
- TEST-03 (P4-3 with mocked automation) — env-dependent; defer until
  real SLACK*\*/FLOWDESK_GITLAB*\* secrets are wired.
- TEST-04 (notification unreadCount semantics) — premature; rename
  or behavior change requires a UX decision first.
- TEST-06 (verify baseline split) — process concern, not code.
- TEST-09 (integration revoke O(N)) — premature; N=1 in practice.
- ARCH-04 (lib/ junk-drawer drift) — larger than one plan; deferred
  for a future audit tier. Plan 025's safeEmit and serialize
  extractions are the first steps of that larger work.
- DOCKER-01 Bug 3 (packages/db exports .ts without runtime build) —
  plan 026 step 9 includes the build step, but verification of the
  full docker build is env-dependent (slow npm registry). Fix is
  land-able; build verification is the operator's job.
- DOCS-02 (OpenAPI generation) — out of scope; plan 026 adds the
  public API write endpoints and shared schemas, the OpenAPI tool
  itself is a follow-up.
- PRD-01 (Phase 4 broader than PRD audience) — strategic, not a fix.
- DIR-01..08 (direction suggestions) — these are options, not
  problems. The maintainer picks; the audit surfaces them with
  evidence.

## Direction suggestions (carry-over, not addressed in plans)

These are NOT plans. They are options the maintainer can pick up in a
future brainstorm:

- **DIR-01 / DOCS-04**: Public API has read/list but zero write surface
  (partially addressed in plan 026 step 4; full write scope is
  product-decision).
- **DIR-02**: Outgoing webhooks exist, no inbound webhook receiver
  (model after `Webhook` + `webhook-sign.ts`).
- **DIR-03**: CSV export ships; no CSV import (even seed.ts has a
  task titled "Add CSV import for bulk task creation").
- **DIR-04**: Slack/GitLab routes exist but ship 501 until env secrets
  are set (operator task; see `claude-progress.md` P4-3 session).
- **DIR-05**: Burndown chart ships with data; no velocity/throughput
  reports.
- **DIR-06**: `Integration` model is two providers; the schema is ready
  for more (Linear/Notion/Jira). Adding a 3rd is ~1/3 the cost of P4-3.
- **DIR-07**: Web realtime architecture is solid; no PWA/native entry.
- **DIR-08**: Automation rules engine is the foundation for a no-code
  builder (extend `condition` DSL with `all/any/none` nesting).
