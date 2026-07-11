---
name: plan-feature
description: >
  Use when planning, implementing, or shipping a FlowDesk feature end-to-end.
  Pass a feature request, ROADMAP id (e.g. P1-3), or "next".
argument-hint: '<feature request | ROADMAP id | next>'
---

Feature request: $ARGUMENTS

Load and follow the plan-feature skill at `.agents/skills/plan-feature/SKILL.md` (canonical harness).

1. Resolve `$ARGUMENTS` as the target in step 0 (empty / "next" → next unfinished ROADMAP or highest-priority `feature_list` item).
2. Invoke Superpowers sub-skills as required by that skill — do not re-implement brainstorm/plan/execute inline.
3. Do not skip hard gates (design approval, plan "go", fresh `pnpm verify` before `passing`).
