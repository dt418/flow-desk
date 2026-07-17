#!/usr/bin/env bash
# Sync multi-agent adapters for FlowDesk harness skills.
# Idempotent: safe to re-run. Canonical content lives under .agents/skills/.
#
# Usage: ./scripts/sync-agent-adapters.sh
#        pnpm sync:agents   (if wired in package.json)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Skills tracked under .agents/skills/ (canonical trees)
SKILLS=(
  plan-feature
  flowdesk-team
  flowdesk-implement
  flowdesk-security-review
  flowdesk-qa
  harness
)

# Slash commands: canonical body in .pi/prompts/{name}.md
SLASH_COMMANDS=(
  plan-feature
  flowdesk-team
)

link_skill_dir() {
  local parent="$1"
  local name="$2"
  local rel="../../.agents/skills/${name}"
  mkdir -p "$parent"
  rm -rf "${parent}/${name}"
  ln -sfn "$rel" "${parent}/${name}"
  echo "  skill  ${parent}/${name} -> ${rel}"
}

link_command() {
  local dest="$1"
  local rel="$2"
  mkdir -p "$(dirname "$dest")"
  rm -f "$dest"
  ln -sfn "$rel" "$dest"
  echo "  cmd    ${dest} -> ${rel}"
}

echo "sync-agent-adapters: FlowDesk harness skills"

for name in "${SKILLS[@]}"; do
  if [[ ! -f ".agents/skills/${name}/SKILL.md" ]]; then
    echo "error: missing canonical skill at .agents/skills/${name}/SKILL.md" >&2
    exit 1
  fi
done

for name in "${SLASH_COMMANDS[@]}"; do
  if [[ ! -f ".pi/prompts/${name}.md" ]]; then
    echo "error: missing slash body at .pi/prompts/${name}.md" >&2
    exit 1
  fi
done

echo "Skills (directory symlink → canonical):"
for name in "${SKILLS[@]}"; do
  link_skill_dir ".claude/skills" "$name"
  link_skill_dir ".codex/skills" "$name"
  link_skill_dir ".opencode/skills" "$name"
  link_skill_dir ".cursor/skills" "$name"
  link_skill_dir ".grok/skills" "$name"
  # Pi: skill tree discoverable beside slash prompts
  rm -rf ".pi/prompts/${name}"
  ln -sfn "../../.agents/skills/${name}" ".pi/prompts/${name}"
  echo "  skill  .pi/prompts/${name} -> ../../.agents/skills/${name}"
done

echo "Commands (symlink → shared slash body):"
for name in "${SLASH_COMMANDS[@]}"; do
  rel="../../.pi/prompts/${name}.md"
  link_command ".claude/commands/${name}.md" "$rel"
  link_command ".opencode/command/${name}.md" "$rel"
  link_command ".grok/commands/${name}.md" "$rel"
  link_command ".cursor/commands/${name}.md" "$rel"
done

echo "Root instruction aliases:"
if [[ -e CLAUDE.md && ! -L CLAUDE.md ]]; then
  echo "  skip   CLAUDE.md (real file present — not overwriting)"
else
  ln -sfn AGENTS.md CLAUDE.md
  echo "  root   CLAUDE.md -> AGENTS.md"
fi

echo "Verify:"
fail=0
for name in "${SKILLS[@]}"; do
  canon="$(readlink -f ".agents/skills/${name}/SKILL.md")"
  for p in \
    ".claude/skills/${name}/SKILL.md" \
    ".codex/skills/${name}/SKILL.md" \
    ".opencode/skills/${name}/SKILL.md" \
    ".cursor/skills/${name}/SKILL.md" \
    ".grok/skills/${name}/SKILL.md" \
    ".pi/prompts/${name}/SKILL.md"
  do
    got="$(readlink -f "$p" 2>/dev/null || true)"
    if [[ "$got" == "$canon" ]]; then
      echo "  OK  $p"
    else
      echo "  FAIL $p (got: ${got:-missing})" >&2
      fail=1
    fi
  done
done

if [[ ! -d .claude/agents ]]; then
  echo "  WARN .claude/agents missing (expected harness agent defs)" >&2
  fail=1
else
  for a in fd-explorer fd-implementer fd-security fd-qa fd-docs; do
    if [[ -f ".claude/agents/${a}.md" ]]; then
      echo "  OK  .claude/agents/${a}.md"
    else
      echo "  FAIL missing .claude/agents/${a}.md" >&2
      fail=1
    fi
  done
fi

if [[ "$fail" -ne 0 ]]; then
  echo "sync-agent-adapters: FAILED" >&2
  exit 1
fi

echo "sync-agent-adapters: OK"
