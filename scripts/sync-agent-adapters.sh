#!/usr/bin/env bash
# Sync multi-agent adapters for FlowDesk harness skills.
# Idempotent: safe to re-run. Canonical content lives under .agents/skills/.
#
# Usage: ./scripts/sync-agent-adapters.sh
#        pnpm sync:agents   (if wired in package.json)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CANON_SKILL_REL="../../.agents/skills/plan-feature"
SLASH_BODY=".pi/prompts/plan-feature.md"
SLASH_REL_FROM_CMD="../../.pi/prompts/plan-feature.md"

link_skill_dir() {
  local parent="$1"
  mkdir -p "$parent"
  rm -rf "${parent}/plan-feature"
  ln -sfn "$CANON_SKILL_REL" "${parent}/plan-feature"
  echo "  skill  ${parent}/plan-feature -> ${CANON_SKILL_REL}"
}

link_command() {
  local dest="$1"
  local rel="$2"
  mkdir -p "$(dirname "$dest")"
  rm -f "$dest"
  ln -sfn "$rel" "$dest"
  echo "  cmd    ${dest} -> ${rel}"
}

echo "sync-agent-adapters: FlowDesk plan-feature"

if [[ ! -f .agents/skills/plan-feature/SKILL.md ]]; then
  echo "error: missing canonical skill at .agents/skills/plan-feature/SKILL.md" >&2
  exit 1
fi

if [[ ! -f "$SLASH_BODY" ]]; then
  echo "error: missing slash body at ${SLASH_BODY}" >&2
  exit 1
fi

echo "Skills (directory symlink → canonical):"
link_skill_dir ".claude/skills"
link_skill_dir ".codex/skills"
link_skill_dir ".opencode/skills"
link_skill_dir ".cursor/skills"
link_skill_dir ".grok/skills"
# Pi loads slash from prompts; keep skill tree discoverable beside it
rm -rf .pi/prompts/plan-feature
ln -sfn "../../.agents/skills/plan-feature" .pi/prompts/plan-feature
echo "  skill  .pi/prompts/plan-feature -> ../../.agents/skills/plan-feature"

echo "Commands (symlink → shared slash body):"
link_command ".claude/commands/plan-feature.md" "$SLASH_REL_FROM_CMD"
link_command ".opencode/command/plan-feature.md" "$SLASH_REL_FROM_CMD"
link_command ".grok/commands/plan-feature.md" "$SLASH_REL_FROM_CMD"
link_command ".cursor/commands/plan-feature.md" "$SLASH_REL_FROM_CMD"

echo "Root instruction aliases:"
if [[ -e CLAUDE.md && ! -L CLAUDE.md ]]; then
  echo "  skip   CLAUDE.md (real file present — not overwriting)"
else
  ln -sfn AGENTS.md CLAUDE.md
  echo "  root   CLAUDE.md -> AGENTS.md"
fi

echo "Verify:"
canon="$(readlink -f .agents/skills/plan-feature/SKILL.md)"
fail=0
for p in \
  .claude/skills/plan-feature/SKILL.md \
  .codex/skills/plan-feature/SKILL.md \
  .opencode/skills/plan-feature/SKILL.md \
  .cursor/skills/plan-feature/SKILL.md \
  .grok/skills/plan-feature/SKILL.md \
  .pi/prompts/plan-feature/SKILL.md
do
  got="$(readlink -f "$p" 2>/dev/null || true)"
  if [[ "$got" == "$canon" ]]; then
    echo "  OK  $p"
  else
    echo "  FAIL $p (got: ${got:-missing})" >&2
    fail=1
  fi
done

if [[ "$fail" -ne 0 ]]; then
  echo "sync-agent-adapters: FAILED" >&2
  exit 1
fi

echo "sync-agent-adapters: OK (canonical ${canon})"
