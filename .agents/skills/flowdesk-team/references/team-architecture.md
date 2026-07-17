# FlowDesk team architecture

## Pattern mix

| Pattern           | Where                                             |
| ----------------- | ------------------------------------------------- |
| Pipeline          | explore → implement → review → docs               |
| Fan-out/fan-in    | security ∥ qa in Phase 3                          |
| Producer-reviewer | implementer ↔ security/qa fix loops               |
| Expert pool       | optional: only security or only qa if user scopes |

## Team size

Default 3–5 active agents per run. Prefer fewer focused agents over full roster when task is narrow (e.g. security-only → explorer optional + security + docs optional).

## Subagent type hints (Claude Code)

| Agent          | subagent_type                        |
| -------------- | ------------------------------------ |
| fd-explorer    | Explore or general-purpose read-only |
| fd-implementer | general-purpose                      |
| fd-security    | general-purpose                      |
| fd-qa          | general-purpose (must run tests)     |
| fd-docs        | general-purpose                      |

Harness upstream defaults model to opus when available; other hosts use default high-quality model.

## Workspace layout

```
_workspace/
  00_input/brief.md
  01_explorer_map.md
  02_implementer_notes.md
  03_security_review.md
  04_qa_report.md
  05_docs_summary.md
```

## Evolution

## After runs, log skill/agent changes in AGENTS.md harness changelog table.
