# Multi-agent adapters

**Single source of truth**

| Role                      | Path                                |
| ------------------------- | ----------------------------------- |
| Skill bodies + refs       | `.agents/skills/{name}/`            |
| Agent role defs (harness) | `.claude/agents/fd-*.md`            |
| Slash command bodies      | `.pi/prompts/{name}.md`             |
| Project rules             | `AGENTS.md` (`CLAUDE.md` → symlink) |

Edit canonical files only. Host paths are **directory or file symlinks**. Never fork skill body per host.

Rebuild links anytime:

```bash
pnpm sync:agents
# or: bash scripts/sync-agent-adapters.sh
```

`./init.sh` runs this automatically.

## Tracked skills

| Skill                      | Role                                                    |
| -------------------------- | ------------------------------------------------------- |
| `plan-feature`             | Product feature pipeline (Superpowers + FlowDesk gates) |
| `flowdesk-team`            | Multi-role team orchestrator (revfactory/harness style) |
| `flowdesk-implement`       | Module layout / schema hygiene                          |
| `flowdesk-security-review` | Multi-tenant security review                            |
| `flowdesk-qa`              | Boundary QA + `pnpm verify` evidence                    |
| `harness`                  | Meta-factory to reconfigure agents/skills               |

## Uniform layout

**Skills** — every host gets a **directory symlink** to each canonical tree:

```
.claude/skills/{name}   →  ../../.agents/skills/{name}
.codex/skills/{name}    →  ../../.agents/skills/{name}
.opencode/skills/{name} →  ../../.agents/skills/{name}
.cursor/skills/{name}   →  ../../.agents/skills/{name}
.grok/skills/{name}     →  ../../.agents/skills/{name}
.pi/prompts/{name}      →  ../../.agents/skills/{name}
```

**Commands** — slash bodies currently:

```
plan-feature.md
flowdesk-team.md
```

linked from `.claude/commands/`, `.opencode/command/`, `.cursor/commands/`, `.grok/commands/` → `.pi/prompts/{name}.md`.

**Root rules**

```
CLAUDE.md  →  AGENTS.md
```

## Discovery matrix

| Agent           | Skills                                | Slash / command                         | Project rules             |
| --------------- | ------------------------------------- | --------------------------------------- | ------------------------- |
| **Claude Code** | `.claude/skills/` + `.claude/agents/` | `/plan-feature`, `/flowdesk-team`       | `CLAUDE.md` / `AGENTS.md` |
| **Codex**       | `.codex/skills/`                      | skill auto-match                        | `AGENTS.md`               |
| **OpenCode**    | `.opencode/skills/`                   | `.opencode/command/`                    | `AGENTS.md`               |
| **Pi**          | `.pi/prompts/{skill}/`                | `.pi/prompts/{name}.md`                 | `AGENTS.md`               |
| **Cursor**      | `.cursor/skills/`                     | `.cursor/commands/`                     | `AGENTS.md` + `.cursor/`  |
| **Grok**        | `.agents/skills/` + `.grok/skills/`   | `.grok/commands/` + `.claude/commands/` | `AGENTS.md`               |
| **Generic**     | `.agents/skills/`                     | read skill path                         | `AGENTS.md`               |

All skill adapters resolve to the **same** `SKILL.md` inode (via symlink). Auto-activation uses the skill `description` field.

## Slash command contract

Thin prompt only (`.pi/prompts/{name}.md`):

1. Inject user args (`$ARGUMENTS` or host equivalent).
2. Load canonical `SKILL.md` step 0+.
3. Do not duplicate gates or process.

## Superpowers resolution

Sub-skills may appear as `brainstorming`, `superpowers:brainstorming`, or a host install path. Same process skill either way. If missing locally, search host skill dirs before inventing a substitute.

## Tool mapping (host-native)

| Intent              | Map to host                                          |
| ------------------- | ---------------------------------------------------- |
| Read file           | host read                                            |
| Edit file           | host write / apply_patch                             |
| Run shell           | host bash / terminal                                 |
| Dispatch subagent   | Task / agent / subagent                              |
| Agent team (Claude) | TeamCreate / SendMessage / TaskCreate when available |
| Todo checklist      | host todo / task list                                |

## Git tracking

- Canonical skills under `.agents/skills/{whitelisted}/**` are tracked (see `.gitignore`).
- `.claude/agents/*.md` agent definitions are tracked.
- Adapter symlinks under `.claude/`, `.codex/`, `.opencode/`, `.pi/`, `.cursor/`, `.grok/` are **committed**.
- `scripts/sync-agent-adapters.sh` recreates adapters after clone if a link breaks.

## Adding a new skill

1. Create `.agents/skills/{name}/SKILL.md` (+ refs).
2. Whitelist in `.gitignore`.
3. Add `{name}` to `SKILLS` array in `scripts/sync-agent-adapters.sh`.
4. If slash needed: add `.pi/prompts/{name}.md` and `SLASH_COMMANDS` entry.
5. Run `pnpm sync:agents`.
6. Never copy-paste skill body into host dirs.
