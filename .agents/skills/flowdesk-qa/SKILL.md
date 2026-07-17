---
name: flowdesk-qa
description: >
  FlowDesk QA: boundary coherence (API shape vs web hooks, routes vs hrefs),
  incremental module verification, and pnpm verify evidence before ship. Use when
  asked to QA, verify, check work, boundary test, "is this ship ready", after
  implement, or when fd-qa is active. Prefer this over existence-only checklists.
  Do not use for product design (plan-feature) or pure security adversarial review
  (flowdesk-security-review).
metadata:
  author: flow-desk
  version: '1.0'
---

# FlowDesk QA

**Why boundary checks:** TypeScript generics and `fetchJson<T>()` lie. Build can pass while the UI reads `.items` of a bare array.

## Phase A — Coherence (before full gate)

1. **API ↔ hooks:** For each changed route, extract response object shape; compare to web `api.ts` / hook types; check pagination wrappers (`{ items, nextCursor }` vs array).
2. **Routes ↔ links:** Collect `href` / `navigate` / router paths from changed UI; confirm pages exist under `apps/web/src/pages` (or router config).
3. **Errors:** Error envelope on API matches toast/error parsing on web.
4. **Socket events:** If realtime changed, event names match client listeners.

Write failures into `_workspace/04_qa_report.md` as BLOCK items.

## Phase B — Automated tests

```bash
# targeted first (adjust filters)
pnpm --filter @flow-desk/api test:unit
pnpm --filter @flow-desk/api test:integration
pnpm --filter @flow-desk/web test:unit

# ship gate
pnpm verify
```

Record command + pass/fail. Flake once → re-run; second fail → BLOCK.

## Phase C — Verdict

| Verdict | Condition                                                                          |
| ------- | ---------------------------------------------------------------------------------- |
| SHIP    | Coherence clean + `pnpm verify` green this session                                 |
| BLOCK   | Any boundary fail, red tests, or missing membership tests on critical IDOR surface |

## Incremental QA

After each module (not only end of feature):

1. Coherence for that module only.
2. Package-level typecheck/tests.
3. Full `pnpm verify` before `passing` / merge.

## Web UI

User-visible behavior change → component test expected (project F8 pattern). Missing test → BLOCK or explicit residual with owner.

## Evidence for fd-docs

Include in report:

- Test counts or verify summary line
- Commit SHA if already committed
- Files that still lack coverage (residual)

---
