---
name: flowdesk-team
description: >
  Orchestrate the FlowDesk agent team (explorer → implementer → security + QA
  fan-out → docs) for multi-role ship, review, or hardening work. Use when the
  user says "flowdesk team", "ship with harness", "agent team", "full review
  then ship", "run flowdesk harness", multi-role implement+security+QA,
  re-run/update/fix prior team results, or /flowdesk-team. For single product
  feature plan→design→gates use plan-feature instead. For meta reconfiguration
  of agents/skills use harness skill.
metadata:
  author: flow-desk
  version: '1.0'
  harness: revfactory/harness
---

# FlowDesk team orchestrator

Coordinates specialized agents defined under `.claude/agents/`. **Does not replace `plan-feature`** — that remains the product-feature pipeline (brainstorm → plan → Superpowers). Use this skill when work needs multi-role collaboration (implement + security + QA + durable docs) or a structured review-before-ship pass.

## Execution mode: hybrid

| Phase       | Mode                                                   | Why                                |
| ----------- | ------------------------------------------------------ | ---------------------------------- |
| 0 Context   | orchestrator only                                      | mode detect                        |
| 1 Explore   | subagent `fd-explorer`                                 | single map, no peer chat needed    |
| 2 Implement | subagent(s) `fd-implementer`                           | sequential code ownership          |
| 3 Review    | **team or parallel subagents** `fd-security` + `fd-qa` | independent lenses; share findings |
| 4 Docs      | subagent `fd-docs`                                     | after SHIP only                    |

**Host tools:** map `TeamCreate` / `SendMessage` / `TaskCreate` to Claude Code team APIs when available; otherwise spawn parallel `Task` / subagents (Grok, Codex, etc.) and merge `_workspace/` files. Prefer best available model for security/QA.

**Agents must load** their definition files from `.claude/agents/{name}.md` (do not invent roles only in chat prompts).

## Agent roster

| Agent          | File                               | Skills                     | Output                                          |
| -------------- | ---------------------------------- | -------------------------- | ----------------------------------------------- |
| fd-explorer    | `.claude/agents/fd-explorer.md`    | —                          | `_workspace/01_explorer_map.md`                 |
| fd-implementer | `.claude/agents/fd-implementer.md` | `flowdesk-implement`       | code + `_workspace/02_implementer_notes.md`     |
| fd-security    | `.claude/agents/fd-security.md`    | `flowdesk-security-review` | `_workspace/03_security_review.md`              |
| fd-qa          | `.claude/agents/fd-qa.md`          | `flowdesk-qa`              | `_workspace/04_qa_report.md`                    |
| fd-docs        | `.claude/agents/fd-docs.md`        | AGENTS.md handoff rules    | harness files + `_workspace/05_docs_summary.md` |

## Workflow

### Phase 0 — Context

1. Read `claude-progress.md`, `feature_list.json`, `AGENTS.md`, recent `git log -5`.
2. Check `_workspace/`:
   - **missing** → initial run
   - **exists + partial fix request** → re-run only named agents; keep other artifacts
   - **exists + new goal** → move to `_workspace_YYYYMMDD_HHMMSS/` then fresh `_workspace/`
3. If product feature needs design gates and none approved → **hand off to `plan-feature`** (do not skip design).
4. Create `_workspace/00_input/brief.md` with goal, constraints, paths.

### Phase 1 — Explore

Dispatch **fd-explorer** with brief. Wait for map. Abort if target is ambiguous and user not reachable — ask one clarifying question.

### Phase 2 — Implement

Dispatch **fd-implementer** with map + plan/spec path.  
If review-only request (no code change): skip to Phase 3 with git diff / paths.

Hard stops:

- Baseline broken before implement → fix baseline first.
- Out of feature scope → stop and confirm.

### Phase 3 — Security + QA (fan-out)

**Parallel:**

1. **fd-security** on changed surface.
2. **fd-qa** on boundaries + tests (may start with coherence while security runs).

If host supports agent teams: one review team, members share critical findings via message; else merge files after both return.

**Gate:**

- Security `FAIL` (any critical/high blocking) → implementer fix loop (max 2) → re-review.
- QA `BLOCK` → same.
- After 2 loops still FAIL/BLOCK → stop; report residual to user (do not force docs/passing).

### Phase 4 — Docs (only on SHIP)

Dispatch **fd-docs** with QA evidence. Update `feature_list` / progress / handoff per AGENTS.md. Do not mark `passing` without fresh verify in QA report.

### Phase 5 — Cleanup

- Keep `_workspace/` for audit (do not delete).
- Summarize for user: verdict, findings count, next step.
- Offer feedback: "Want to adjust team or skills?" (harness evolution).

## Data protocol

| Strategy                  | Use                                |
| ------------------------- | ---------------------------------- |
| Files under `_workspace/` | primary artifacts                  |
| Subagent return messages  | short status only                  |
| Team messages             | live critical security/QA findings |

Naming: `{phase}_{agent}_{artifact}.md`

## Error handling

| Error                     | Action                                               |
| ------------------------- | ---------------------------------------------------- |
| Agent crash               | retry once; then continue without artifact; note gap |
| Contradict security vs QA | keep both; blocking wins                             |
| User cancel               | leave `_workspace/`; no partial `passing`            |

## Relationship to plan-feature

```
plan-feature          flowdesk-team
─────────────         ─────────────
brainstorm            (assumes design exists or review-only)
writing-plans         brief in _workspace
execute (Superpowers) Phase 2 implementer
verify skill          Phase 3 qa (+ security)
finish branch         Phase 4 docs + user ship choice
```

Typical combo: run `plan-feature` through plan approval → execute with Superpowers **or** execute via `flowdesk-team` Phase 2–4 when multi-role review is required.

## Test scenarios

**Happy path:** "Review and ship the chat membership fix" → explore → implement if needed → security PASS → qa SHIP → docs updated.

**Error path:** security finds IDOR → implementer fixes → security still FAIL → stop; docs not marked passing.

## Triggers (should)

- flowdesk team / ship with harness / full security+qa / /flowdesk-team
- re-run QA only / fix security findings from last run

## Should NOT trigger

- "next feature from ROADMAP" → `plan-feature`
- "harness 재구성 / build a harness" → `harness` meta skill
- pure one-line typo → direct edit, no team

---
