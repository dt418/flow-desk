# Multi-agent adapters

**Single source of truth:** `.agents/skills/plan-feature/`

Edit `SKILL.md` and `references/*` only under that path. Agent-specific paths are thin loaders (symlink or slash prompt). Do not fork skill body per agent.

## Layout

```
.agents/skills/plan-feature/          # CANONICAL (Agent Skills standard)
  SKILL.md
  references/
    harness.md                        # FlowDesk paths + conventions
    adapters.md                       # this file

.claude/skills/plan-feature        →  ../../.agents/skills/plan-feature
.codex/skills/plan-feature/*       →  ../../../.agents/skills/plan-feature/*
.opencode/skills/plan-feature/*    →  ../../../.agents/skills/plan-feature/*
.pi/prompts/plan-feature/*         →  ../../../.agents/skills/plan-feature/*

.pi/prompts/plan-feature.md           # slash command body ($ARGUMENTS)
.claude/commands/plan-feature.md   →  ../../.pi/prompts/plan-feature.md
.opencode/command/plan-feature.md  →  ../../.pi/prompts/plan-feature.md
```

## How each agent discovers the skill

| Agent                    | Discovery                                                            | Invocation                            |
| ------------------------ | -------------------------------------------------------------------- | ------------------------------------- |
| **Claude Code**          | `.claude/skills/plan-feature` (dir symlink) + description auto-match | `/plan-feature …` or natural language |
| **Codex**                | `.codex/skills/plan-feature/SKILL.md`                                | Skill name / description match        |
| **OpenCode**             | `.opencode/skills/plan-feature/` + command                           | `/plan-feature` or skill match        |
| **Pi**                   | slash prompt + skill tree under prompts                              | `/plan-feature …`                     |
| **Grok / generic**       | `.agents/skills/plan-feature/` + `AGENTS.md` pointer                 | Description match or "plan feature"   |
| **Any AGENTS.md reader** | Startup + Feature workflow section                                   | Read + follow canonical `SKILL.md`    |

## Slash command contract

Thin prompt only:

1. Inject user args as feature target (`$ARGUMENTS` or host equivalent).
2. Load and follow canonical `SKILL.md` step 0+.
3. Do not duplicate gates or process in the slash file.

Shared body: `.pi/prompts/plan-feature.md`.

## Superpowers resolution

Sub-skills may appear as:

- `brainstorming`
- `superpowers:brainstorming`
- path under user/global skills install

Same process skill either way. If missing locally, search host skill dirs / Superpowers install before inventing a substitute workflow.

## Tool mapping (host-native)

| Intent in skill       | Map to host                        |
| --------------------- | ---------------------------------- |
| Read file             | host read / cat                    |
| Edit file             | host write / apply_patch           |
| Run shell             | host bash / terminal               |
| Dispatch subagent     | Task / agent / subagent tool       |
| Create todo checklist | host todo / task list              |
| Web search            | host search (rare in this harness) |

Do not fail because tool names differ — map by intent.

## Git tracking

`.gitignore` ignores most of `.agents/` but **whitelists** this skill:

```
!.agents/skills/plan-feature/
!.agents/skills/plan-feature/**
```

Vendor skills under `.agents/skills/*` stay local; FlowDesk harness skill is committed.

## Adding a new agent

1. Prefer **symlink** of the whole skill dir (or `SKILL.md` + `references/`) to `.agents/skills/plan-feature`.
2. If the agent only supports slash/commands: thin file that loads canonical `SKILL.md` + passes args.
3. Never copy-paste skill body into the new adapter.
4. Document the path in the table above.
