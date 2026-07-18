---
name: plan-feature
description: >
  Use when the user wants to plan, implement, build, or ship a FlowDesk feature;
  says "plan feature", "implement feature", "build feature", "ship feature",
  "next feature", "next ROADMAP item", "highest-priority unfinished feature",
  "pull from ROADMAP", or invokes /plan-feature; also when starting or resuming
  work that should update feature_list.json, claude-progress.md, or ROADMAP.md.
metadata:
  author: flow-desk
  version: '2.2'
  inherits: superpowers
---

# Plan Feature

FlowDesk **tracer-bullet** harness: one feature, one active track, durable artifacts, evidence before `passing`.

**Core principle:** This skill **orchestrates** Superpowers + FlowDesk harness. Do **not** re-implement brainstorm/plan/execute here — **invoke** the sub-skills.

Announce once at start: `Using plan-feature for <target>.`

## When to use / not

| Use                                                           | Do not use                                  |
| ------------------------------------------------------------- | ------------------------------------------- |
| New product feature (freeform, ROADMAP id, or "next")         | Pure bugfix → `systematic-debugging`        |
| Resume `not_started` / `in_progress` / `blocked` feature work | Docs/refactor with no feature ship intent   |
| User wants plan → approve → implement → verify                | Q&A about existing code (no implementation) |

If unsure whether it is a feature ship: prefer this skill when `feature_list.json` or `ROADMAP.md` will change.

## Inheritance (required sub-skills)

Resolve names with or without a `superpowers:` prefix — same skills, host-dependent.

| #   | Skill                                                              | When                                                                   |
| --- | ------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| 1   | `brainstorming`                                                    | Design only; hard gate until **explicit** approval                     |
| 2   | `writing-plans`                                                    | After design approved                                                  |
| 3   | `subagent-driven-development` (preferred) **or** `executing-plans` | After explicit **"go"**                                                |
| 3.5 | `using-git-worktrees`                                              | Before step 4 execution — isolate feature work if not already isolated |
| 4   | `verification-before-completion`                                   | Before any "done" / `passing` claim                                    |
| 5   | `finishing-a-development-branch`                                   | After all tasks verified (feature branch)                              |

Mid-execute (invoke when condition matches):

| Skill                         | Invoke when                                                       |
| ----------------------------- | ----------------------------------------------------------------- |
| `test-driven-development`     | Any production code task — write failing test first               |
| `using-git-worktrees`         | Feature needs isolation from main (skip if already in worktree)   |
| `requesting-code-review`      | Task complete or before merge — dispatch code-reviewer            |
| `receiving-code-review`       | Review feedback received — verify before implementing suggestions |
| `dispatching-parallel-agents` | 2+ independent tasks with no shared state — parallel dispatch     |

FlowDesk paths, module layout, schema hygiene, `feature_list` shape: load [references/harness.md](references/harness.md) when needed — do not paste into every turn.

Multi-agent install paths: [references/adapters.md](references/adapters.md).

## Hard gates (never skip)

| Gate    | Stop until                                             | Never                                                          |
| ------- | ------------------------------------------------------ | -------------------------------------------------------------- |
| Design  | Explicit approval (`yes` / `approved` / `lgtm design`) | Infer approval from silence or "looks good so far" mid-section |
| Plan    | Explicit `go` / `execute` / `ship it`                  | Auto-execute after writing the plan                            |
| Passing | Fresh `pnpm verify` evidence **in this session**       | Mark complete on code alone                                    |

User says "just implement" / "skip design": still run a **short** design (`brainstorming` allows short designs) and get a **one-line** approval. Skip design only if user already supplied an **approved** design/spec path.

**Violating the letter of a gate is violating the spirit of the gate.**

## Process

### 0. Resolve target

First match wins (confirm if ambiguous):

1. Explicit request / `$ARGUMENTS` / freeform feature text
2. Named ROADMAP id (`P1-3`, …) or "next ROADMAP item"
3. Highest-priority unfinished entry in `feature_list.json` (`status` ≠ `passing`)

If ROADMAP / feature_list sourced: **confirm id + title** before step 1.

### 1. Context + baseline

Read without asking first:

- `claude-progress.md`, `feature_list.json`, `AGENTS.md`
- `ROADMAP.md` section for target (if ROADMAP-sourced)
- Linked `docs/superpowers/specs/*` if present

Skim as needed: `PRD.md`, `TASKS.md`, `ACCEPTANCE.md`, `RISKS.md`.

Startup: `pwd` = repo root; `git log --oneline -5`; run `./init.sh` if stack not ready.

Baseline red → **fix first**. Do not stack feature work on broken verify.

`feature_list.json`: mark `in_progress` only when **execution** starts (step 4). **Only one** `in_progress` — clear others first.

### 2. Brainstorm (full verbosity)

**REQUIRED:** invoke `brainstorming`.

- One clarifying question per turn; 2–3 approaches when non-trivial
- Present design → **STOP** for explicit approval
- Spec path: `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
- Apply FlowDesk extras from harness (schema hygiene, F8 web tests, single-active-feature)

Caveman: **off** this phase.

### 3. Plan (caveman OK on plan body)

**REQUIRED:** invoke `writing-plans`.

- Plan path: `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`
- Header + file map + checkbox TDD tasks
- Global constraints: AGENTS.md stack, schema hygiene, `pnpm verify` before commits
- Final tasks: update `feature_list.json` + `claude-progress.md` + evidence

**STOP.** Show plan path. Wait for explicit **"go"**.

### 4. Execute

Invoke execution sub-skill based on plan shape:

- **Independent tasks** (no shared state): invoke `dispatching-parallel-agents`
- **Sequential / same-session work**: invoke `subagent-driven-development`
- **Fallback**: invoke `executing-plans`

Before first code task: set target `status: in_progress` (only one). Follow module layout in harness.

During execution, invoke as needed:

| Condition                      | Invoke                    |
| ------------------------------ | ------------------------- |
| Any production code task       | `test-driven-development` |
| Feature needs branch isolation | `using-git-worktrees`     |
| Task complete / before merge   | `requesting-code-review`  |
| Review feedback received       | `receiving-code-review`   |

Caveman: **on** for plan/execute narration. **Off** for commits, PR text, `claude-progress.md`, `feature_list.json` notes.

Do not pause for "should I continue?" between plan tasks unless BLOCKED or genuinely ambiguous.

### 5. Verify + close

**REQUIRED:** `verification-before-completion` before any passing claim.

1. `pnpm verify` green (fix and re-run until green)
2. `feature_list.json` → `status: passing` + `verification` + `evidence` + `notes`
3. Session record on `claude-progress.md` (normal verbosity)
4. `RISKS.md` if new risk
5. Repo restartable from `./init.sh`
6. Feature branch → `finishing-a-development-branch`

Done only when **all** true (AGENTS.md Definition of Done): behavior implemented, verification ran, evidence recorded, `./init.sh` restartable.

## Rationalizations (do not comply)

| Excuse                               | Reality                                                          |
| ------------------------------------ | ---------------------------------------------------------------- |
| "Too small for design"               | Short design + one-line approval still required                  |
| "They said implement, so skip gates" | Still short design + plan go unless approved spec already exists |
| "Plan is the approval"               | Plan write ≠ execute permission                                  |
| "Tests passed earlier"               | Fresh `pnpm verify` this session for `passing`                   |
| "Code is done, mark passing"         | Evidence in `feature_list.json` required                         |
| "Second feature is quick"            | One `in_progress` only                                           |
| "I'll add Board/Epic now for later"  | Schema hygiene — do not invent future models                     |
| "UI change, skip component test"     | F8 pattern required when web UI changes                          |
| "`--no-verify` just this once"       | Never                                                            |

## Red flags — STOP

- Coding before design approval
- Executing plan without **"go"**
- Marking `passing` without fresh `pnpm verify` output in this session
- Second concurrent `in_progress` feature
- Inventing Board/Epic/Sprint schema this phase
- Skipping web component test when UI changed
- Bypassing lefthook / secret scan
- Secrets in chat, commits, or feature evidence

## Platform notes

- **Canonical tree:** `.agents/skills/plan-feature/` (Agent Skills standard). Other agents symlink or load this tree — edit only here.
- **Slash:** `/plan-feature` → thin prompt injects `$ARGUMENTS`, then this skill (see adapters).
- **Superpowers:** process skills above are source of truth for mechanics; this skill only sequences them + FlowDesk harness.
- **Tools:** map "dispatch subagent" / "todo" / "read file" to the host agent’s native tools.
