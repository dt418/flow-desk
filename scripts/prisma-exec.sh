#!/usr/bin/env bash
# scripts/prisma-exec.sh — run prisma commands in the best available mode.
#
# Modes (auto-detected, override with FLOW_DESK_DB_MODE):
#   docker (default) — exec inside the api container via `docker compose exec`.
#                      Requires the docker stack to be running. If not, starts it.
#   local            — run prisma directly on the host. Requires postgres reachable
#                      at the DATABASE_URL in .env (typically localhost:5432).
#
# Usage:
#   scripts/prisma-exec.sh <prisma-args...>
#
# Examples:
#   scripts/prisma-exec.sh db push
#   scripts/prisma-exec.sh db push --skip-generate
#   scripts/prisma-exec.sh migrate dev --name add-user-avatar
#   scripts/prisma-exec.sh studio
#   scripts/prisma-exec.sh generate
#
# Special commands:
#   scripts/prisma-exec.sh seed   → builds seed.cjs on host, then runs it
#                                  (in container if docker mode, on host if local mode)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MODE="${FLOW_DESK_DB_MODE:-}"
API_CWD="$ROOT_DIR/apps/api"

# Detect mode if not explicit
detect_mode() {
  if [ -n "$MODE" ]; then
    echo "$MODE"
    return
  fi
  # Docker mode if api container is running
  if docker compose ps --status running --services 2>/dev/null | grep -q '^api$'; then
    echo "docker"
  else
    echo "local"
  fi
}

DETECTED=$(detect_mode)

# If user explicitly requested docker mode but the api container is not running,
# start the stack first (most user-friendly behavior — single command does it all).
if [ "$DETECTED" = "docker" ] && ! docker compose ps --status running --services 2>/dev/null | grep -q '^api$'; then
  echo "==> API container not running. Starting stack via scripts/docker-up.sh..."
  bash scripts/docker-up.sh up
fi

echo "==> Mode: $DETECTED (set FLOW_DESK_DB_MODE=docker|local to override)"

# Source .env once (used by host-side prisma CLI / seed.cjs in local mode).
# In docker mode the container gets DATABASE_URL from docker-compose.yml env block.
if [ "$DETECTED" = "local" ] && [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT_DIR/.env"
  set +a
fi

# Special handling for "seed": build on host, then run in the right place
if [ "${1:-}" = "seed" ]; then
  shift
  SEED_CJS_HOST="$API_CWD/dist/seed.cjs"
  echo "==> Building seed.cjs on host"
  pnpm --filter @flow-desk/api exec esbuild ../../prisma/seed.ts \
    --bundle --platform=node --format=cjs \
    --outfile="$SEED_CJS_HOST" \
    --external:@prisma/client --external:bcryptjs

  if [ "$DETECTED" = "docker" ]; then
    echo "==> docker — copying seed.cjs into api container"
    docker cp "$SEED_CJS_HOST" "flow-desk-api-1:/app/apps/api/dist/seed.cjs"
    echo "==> Running seed.cjs inside api container"
    docker compose exec -T api node /app/apps/api/dist/seed.cjs "$@"
  else
    echo "==> local — running seed.cjs on host"
    (cd "$API_CWD" && pnpm exec node dist/seed.cjs "$@")
  fi
  exit 0
fi

if [ "$DETECTED" = "docker" ]; then
  # Run prisma inside the api container. Use `pnpm exec prisma` so it picks up
  # the binary from node_modules, NOT the root package.json `prisma` script
  # (which would recurse into this wrapper). Also `cd /app/apps/api` first so
  # the schema path is correct.
  echo "==> docker compose exec api sh -c 'cd /app/apps/api && pnpm exec prisma $*'"
  docker compose exec api sh -c "cd /app/apps/api && pnpm exec prisma $*"
else
  # Run prisma on host. .env already sourced above. Run from apps/api cwd so
  # schema path resolves to prisma/schema.prisma.
  echo "==> pnpm exec prisma $* (cwd: $API_CWD)"
  (cd "$API_CWD" && pnpm exec prisma "$@")
fi