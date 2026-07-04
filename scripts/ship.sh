#!/usr/bin/env bash
# ship.sh — ship a feature or phase after passing the full verify gate.
#
# Usage:
#   ./scripts/ship.sh <feature-id|phase|all> [commit-message]
#   pnpm ship -- <feature-id|phase|all> [commit-message]
#
# Examples:
#   ./scripts/ship.sh task-001
#   ./scripts/ship.sh auth "feat: ship auth phase"
#   ./scripts/ship.sh all "chore: ship sprint 2"
#
# What it does (in order):
#   1. Pre-flight: require clean git tree on main, deps installed.
#   2. Run full verify gate: typecheck → lint → format:check → test → build.
#   3. Mark matching features in feature_list.json as "passing".
#   4. Append a session log entry to claude-progress.md.
#   5. Commit feature_list.json + claude-progress.md (+ any staged source) with
#      a conventional message, then push to origin/main.
#
# Exits non-zero on any gate failure. Never uses --no-verify.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# ─── args ────────────────────────────────────────────────────────────────
if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <feature-id|phase|all> [commit-message]" >&2
  echo "  feature-id:  e.g. task-001 (matches feature_list.json features[].id)" >&2
  echo "  phase:       e.g. auth (matches features[].area)" >&2
  echo "  all:         marks every feature as passing" >&2
  exit 2
fi
TARGET="${1:-}"
MESSAGE="${2:-}"

# ─── pre-flight ──────────────────────────────────────────────────────────
echo "==> ship target: $TARGET"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "main" ]]; then
  echo "ERROR: not on main (on $BRANCH). ship only from main." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: working tree has uncommitted changes. Commit or stash first." >&2
  git status --short >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "==> node_modules missing — running pnpm install"
  pnpm install
fi

# ─── verify gate ─────────────────────────────────────────────────────────
echo "==> running verify gate (typecheck → lint → format:check → test → build)"
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
echo "==> verify gate passed"

# ─── mark features passing in feature_list.json ──────────────────────────
echo "==> updating feature_list.json for target: $TARGET"
python3 - "$TARGET" <<'PY'
import json, sys, datetime
target = sys.argv[1]
path = "feature_list.json"
data = json.load(open(path))
features = data.get("features", [])
changed = []
for f in features:
    match = (
        target == "all"
        or f.get("id") == target
        or f.get("area") == target
    )
    if match and f.get("status") != "passing":
        f["status"] = "passing"
        changed.append(f["id"])
data["last_updated"] = datetime.date.today().isoformat()
json.dump(data, open(path, "w"), indent=2, ensure_ascii=False)
open(path, "a").write("\n")
if changed:
    print(f"  marked passing: {', '.join(changed)}")
else:
    print("  (no status changes — already passing or no match)")
PY

# ─── append session log entry ───────────────────────────────────────────
echo "==> appending session log entry to claude-progress.md"
SESSION_DATE="$(date +%Y-%m-%d)"
COMMIT_SHA_PRE="$(git rev-parse --short HEAD)"
{
  printf "\n## Session %s (ship %s)\n" "$SESSION_DATE" "$TARGET"
  printf -- "- **Ship target**: %s\n" "$TARGET"
  printf -- "- **Verify gate**: typecheck ✓, lint ✓, format:check ✓, test ✓, build ✓\n"
  printf -- "- **Base commit**: %s\n" "$COMMIT_SHA_PRE"
  printf -- "- **Artifact**: feature_list.json updated (target marked passing)\n"
} >> claude-progress.md

# ─── commit + push ───────────────────────────────────────────────────────
echo "==> formatting artifacts (prettier)"
pnpm exec prettier --write feature_list.json claude-progress.md

echo "==> staging artifacts"
git add feature_list.json claude-progress.md

if [[ -z "$(git diff --cached --name-only)" ]]; then
  echo "==> nothing to commit (no changes after gate)" 
  exit 0
fi

if [[ -z "$MESSAGE" ]]; then
  if [[ "$TARGET" == "all" ]]; then
    MESSAGE="chore(progress): ship all — mark features passing after verify gate"
  else
    MESSAGE="chore(progress): ship $TARGET — mark passing after verify gate"
  fi
fi

echo "==> committing: $MESSAGE"
git commit -m "$MESSAGE"

echo "==> pushing to origin/main"
git push origin main

echo "==> ship complete: $TARGET @ $(git rev-parse --short HEAD)"
