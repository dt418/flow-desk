# Multi-agent adapters

**Single source of truth**

| Role               | Path                                |
| ------------------ | ----------------------------------- |
| Skill body + refs  | `.agents/skills/plan-feature/`      |
| Slash command body | `.pi/prompts/plan-feature.md`       |
| Project rules      | `AGENTS.md` (`CLAUDE.md` → symlink) |

Edit canonical files only. Agent paths are **directory or file symlinks**. Never fork skill body per agent.

Rebuild links anytime:

```bash
pnpm sync:agents
# or: bash scripts/sync-agent-adapters.sh
```

`./init.sh` runs this automatically.

## Uniform layout

**Skills** — every host gets a **directory symlink** to the canonical tree:

```
.claude/skills/plan-feature   →  ../../.agents/skills/plan-feature
.codex/skills/plan-feature    →  ../../.agents/skills/plan-feature
.opencode/skills/plan-feature →  ../../.agents/skills/plan-feature
.cursor/skills/plan-feature   →  ../../.agents/skills/plan-feature
.grok/skills/plan-feature     →  ../../.agents/skills/plan-feature
.pi/prompts/plan-feature      →  ../../.agents/skills/plan-feature
```

**Commands** — every host gets a **file symlink** to the shared slash body:

```
.claude/commands/plan-feature.md   →  ../../.pi/prompts/plan-feature.md
.opencode/command/plan-feature.md  →  ../../.pi/prompts/plan-feature.md
.cursor/commands/plan-feature.md   →  ../../.pi/prompts/plan-feature.md
.grok/commands/plan-feature.md     →  ../../.pi/prompts/plan-feature.md
.pi/prompts/plan-feature.md        # real file (canonical slash body)
```

**Root rules**

```
CLAUDE.md  →  AGENTS.md
```

## Discovery matrix

| Agent           | Skills                                       | Slash / command                         | Project rules             |
| --------------- | -------------------------------------------- | --------------------------------------- | ------------------------- |
| **Claude Code** | `.claude/skills/`                            | `.claude/commands/` → `/plan-feature`   | `CLAUDE.md` / `AGENTS.md` |
| **Codex**       | `.codex/skills/`                             | (skill auto-match)                      | `AGENTS.md`               |
| **OpenCode**    | `.opencode/skills/`                          | `.opencode/command/`                    | `AGENTS.md`               |
| **Pi**          | `.pi/prompts/plan-feature/`                  | `.pi/prompts/plan-feature.md`           | `AGENTS.md`               |
| **Cursor**      | `.cursor/skills/`                            | `.cursor/commands/`                     | `AGENTS.md` + `.cursor/`  |
| **Grok**        | `.agents/skills/` + `.grok/skills/` + compat | `.grok/commands/` + `.claude/commands/` | `AGENTS.md`               |
| **Generic**     | `.agents/skills/`                            | read skill path                         | `AGENTS.md`               |

All skill adapters resolve to the **same** `SKILL.md` inode (via symlink). Auto-activation uses the skill `description` field (triggers only — no workflow summary).

## Slash command contract

Thin prompt only (`.pi/prompts/plan-feature.md`):

1. Inject user args (`$ARGUMENTS` or host equivalent).
2. Load canonical `SKILL.md` step 0+.
3. Do not duplicate gates or process.

## Superpowers resolution

Sub-skills may appear as `brainstorming`, `superpowers:brainstorming`, or a host install path. Same process skill either way. If missing locally, search host skill dirs before inventing a substitute.

## Tool mapping (host-native)

| Intent            | Map to host              |
| ----------------- | ------------------------ |
| Read file         | host read                |
| Edit file         | host write / apply_patch |
| Run shell         | host bash / terminal     |
| Dispatch subagent | Task / agent / subagent  |
| Todo checklist    | host todo / task list    |

## Git tracking

- Canonical skill under `.agents/skills/plan-feature/**` is **whitelisted** (rest of `.agents/` stays local/vendor).
- Adapter symlinks under `.claude/`, `.codex/`, `.opencode/`, `.pi/`, `.cursor/`, `.grok/` are **committed**.
- `scripts/sync-agent-adapters.sh` recreates adapters after clone if a link breaks.

## Adding a new agent

1. Prefer **directory symlink**: `<agent>/skills/plan-feature` → `../../.agents/skills/plan-feature` (adjust `../` depth).
2. If slash-only: file symlink to `.pi/prompts/plan-feature.md`.
3. Add the link to `scripts/sync-agent-adapters.sh`.
4. Document in the table above.
5. Never copy-paste skill body.
