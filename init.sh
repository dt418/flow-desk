#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

INSTALL_CMD=(pnpm install)
VERIFY_CMD=(pnpm --filter @flow-desk/shared build)
START_CMD=(docker compose up -d)

echo "==> Working directory: $PWD"
echo "==> Syncing dependencies"
"${INSTALL_CMD[@]}"

echo "==> Running baseline verification (shared package build)"
"${VERIFY_CMD[@]}"

echo "==> Installing git hooks (lefthook: pre-commit secret check + typecheck + format + lint, pre-push full verify)"
pnpm setup:lefthook

echo "==> Syncing multi-agent skill/command adapters (plan-feature → .agents/skills)"
bash scripts/sync-agent-adapters.sh

echo "==> Installing post-commit hook (session log auto-update)"
chmod +x .githooks/post-commit 2>/dev/null || true
git config core.hooksPath .githooks

echo "==> Startup command"
printf '    %q' "${START_CMD[@]}"
printf '\n'

if [ "${RUN_START_COMMAND:-0}" = "1" ]; then
  echo "==> Starting the app"
  exec "${START_CMD[@]}"
fi

echo "Set RUN_START_COMMAND=1 if you want init.sh to launch the app directly."