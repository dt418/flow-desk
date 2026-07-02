# Audit Plans Index

Generated: 2026-07-03 | Base commit: `732acb4` | Audit run: standard

## Priority Order

| Plan | Finding | Category | Effort | Dependencies | Status |
|------|---------|----------|--------|--------------|--------|
| 009 | Email worker bugs (CORRECT-01,02,03) | correctness | S | — | DONE |
| 010 | Security hardening (ATTACH-01, HDR-01, RATE-01) | security | S | — | DONE |
| 011 | Vite prod config (PERF-06, PERF-07) | performance | S | — | DONE |
| 012 | Board over-fetch (PERF-02) | performance | S | — | DONE |
| 013 | Tech debt dedup (TECH-01, TECH-02) | tech-debt | S | — | DONE |
| 014 | `as any` casts (TECH-07) | tech-debt | S | — | DONE |
| 015 | Chat channel uniqueness (CORRECT-08) | correctness | S | — | DONE |
| 016 | Auth + membership caching (PERF-03, PERF-10) | performance | M | Redis available | TODO |
| 017 | Code splitting + lazy loading (PERF-05) | performance | M | 011 | TODO |
| 018 | API client validation (TECH-09) | tech-debt | M | — | TODO |
| 019 | Register/OAuth transactional (CORRECT-06) | correctness | M | — | TODO |
| 020 | Test pipeline — CI unit tests (TC-03) | tests | S | — | TODO |
| 021 | Test pipeline — E2E realtime (TC-04) | tests | M | 020 | TODO |
| 022 | Realtime gateway tests (TC-01) | tests | L | 020 | TODO |

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
```

## Recommended Execution Order

**Batch 1** (parallel, S effort, no deps): 009, 010, 011, 012, 013, 014, 015
**Batch 2** (parallel, M effort): 016, 017, 018, 019, 020
**Batch 3** (after 020): 021, 022

## Previously Completed Plans

| Plan | Status | Notes |
|------|--------|-------|
| 001-008 | DONE (as AUD-004-AUD-008) | Previous audit, 2026-06-28 |
| kanban-sprint-1 | DONE | DnD a11y + click bubbling |
| kanban-sprint-1.5 | DONE | Optimistic race + overlay fade |
| 009-015 | DONE | Batch 1 — email bugs, security, vite, board, dedup, enum, chat |
