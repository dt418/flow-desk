# Audit Playbook — FlowDesk

Audit categories and finding format for the `/improve` skill.

## Categories

1. **Correctness / Bugs** — logic errors, edge-case gaps, null/undefined handling, type unsafety, error-path leaks
2. **Security** — auth bypass, injection, IDOR, secrets exposure, input validation gaps, CSRF, XSS, rate-limit gaps
3. **Performance** — N+1 queries, missing indexes, unbounded list loads, inefficient serialization, memory leaks
4. **Test Coverage** — untested paths, missing integration tests, fragile tests, vacuous assertions
5. **Tech Debt & Architecture** — AGENTS.md violations, missing service/repo split, God objects, circular deps
6. **Dependencies & Migrations** — outdated deps with known CVEs, breaking-change risk, migration gaps
7. **DX & Tooling** — broken scripts, missing typecheck targets, opaque errors, slow builds, broken hot-reload
8. **Docs** — stale docs, missing API docs, absent onboarding guide, misleading READMEs
9. **Direction** — product gaps, missing features worth building, UX friction points, extension points

## Finding Format

```markdown
| # | Finding | Category | Impact | Effort | Risk | Evidence |
|---|---------|----------|--------|--------|------|----------|
```

Fields:

- **Finding** — concise description (what + where, not why + how)
- **Category** — one of the 9 categories above
- **Impact** — HIGH / MEDIUM / LOW (severity of consequence if unfixed)
- **Effort** — S / M / L (cost to fix, relative to repo size)
- **Risk** — HIGH / MEDIUM / LOW (likelihood fix introduces regression)
- **Evidence** — `file:line` references; command output snippets where relevant

For security findings, also record:
- Credential type (not the value itself) at `file:line`
- Whether it is `introduced` (by current branch) or `pre-existing`

## Effort Levels

| Level | Subagents | Categories | Breadth |
|-------|-----------|------------|---------|
| `quick` | 0–1 | correctness, security | hotspots only |
| `standard` | ≤4 | all 9 | hotspot-weighted |
| `deep` | ≤8 | all 9 | whole repo |

## Vetting

Before presenting findings:
1. Open every cited file and confirm the finding is real
2. Reject findings that are documented design decisions (check ADRs)
3. Reject mis-attributed evidence
4. Deduplicate across subagents
5. Record rejections in the "considered and rejected" section

## Confidence Levels

- **HIGH** — confirmed by code inspection + manual test or grep
- **MEDIUM** — likely based on code pattern, edge case not confirmed
- **LOW** — hypothesis worth investigating; not confirmed

## Output Structure

```
# FlowDesk Audit — YYYY-MM-DD
Commit: <short SHA>
Effort: quick | standard | deep

## Vetting Summary
N findings presented, M rejected, K confirmed

## Findings Table
| # | Finding | Category | Impact | Effort | Risk | Evidence |

## Considered and Rejected
- [finding] — reason

## Direction
2–4 grounded suggestions with evidence and trade-offs

## Not Audited
What was out of scope for this effort level
```