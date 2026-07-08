---
name: plan-feature
description: Brainstorm, plan, and execute a flow-desk feature end-to-end
argument-hint: '<feature request>'
---

Feature request: $ARGUMENTS

1. Read `PRD.md`, `TASKS.md`, `RISKS.md`, `ACCEPTANCE.md`, `ROADMAP.md`, `feature_list.json`, and `AGENTS.md` in full before asking anything. If the feature request references `ROADMAP.md`, pull the next unstarted item from the current phase and confirm which item that is before brainstorming.
2. Run the `brainstorming` skill on the feature request, full verbosity. Ask clarifying questions one at a time. **STOP and wait for explicit design approval** — do not infer approval.
3. Once approved: invoke the `writing-plans` skill to produce the implementation plan. Caveman auto-toggle (AGENTS.md) compresses this output.
4. Show the plan. **STOP and wait for explicit "go"** — do not auto-execute.
5. Once approved: execute following AGENTS.md conventions — `apps/api` modules split into `routes/service/repository/schema/types/test`; Zod schemas in `packages/shared`; `apps/web` features as `components/hooks/api/types/index`; only one feature `in_progress` in `feature_list.json` at a time; prefer the `subagent-driven-development` or `executing-plans` skill for multi-step execution.
6. After execution: restore normal verbosity, update `feature_list.json` (status/verification/evidence/notes), append a session record to `claude-progress.md`, leave the repo restartable from `./init.sh`. Run `pnpm verify` and record evidence before marking passing.
