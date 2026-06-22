#!/usr/bin/env bash
# scripts/prisma-exec.sh — run prisma commands in the best available mode.
#
# Modes (auto-detected, override with FLOW_DESK_DB_MODE):
#   docker (default) — exec inside the api container via `docker compose exec`.
#                      If the api container is not running, starts the stack
#                      via scripts/docker-up.sh first.
#   local            — run prisma on the host. Requires postgres reachable at
#                      the DATABASE_URL in .env (typically localhost:5432).
#
# Override behavior:
#   FLOW_DESK_DB_MODE=local  → force host-side, never touch the docker stack.
#   FLOW_DESK_DB_MODE=docker → force docker, auto-start stack if not running.
#   (unset)                  → docker if the api container is already running,
#                              otherwise start the stack and use docker.
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

# Validate FLOW_DESK_DB_MODE up front. Silent fallback to "local" on a typo
# (e.g. FLOW_DESK_DB_MODE=doker in CI) would silently misroute DB traffic.
case "${FLOW_DESK_DB_MODE:-}" in
  ""|docker|local) ;;
  *)
    echo "ERROR: FLOW_DESK_DB_MODE must be 'docker' or 'local', got: '${FLOW_DESK_DB_MODE}'" >&2
    exit 64
    ;;
esac

API_CWD="$ROOT_DIR/apps/api"

api_container_running() {
  docker compose ps --status running --services 2>/dev/null | grep -q '^api$'
}

# Resolve effective mode. Default to docker so the "run `pnpm db:push` and
# have it just work" UX matches pre-#0eabfcd behavior (auto-start stack).
case "${FLOW_DESK_DB_MODE:-}" in
  local)   DETECTED="local" ;;
  docker)  DETECTED="docker" ;;
  "")      DETECTED=$(if api_container_running; then echo docker; else echo docker; fi) ;;
esac
# (The "" branch always picks docker; auto-start below handles the cold case.)

# In docker mode (explicit or default), make sure the api container is running.
# In local mode, never touch the docker stack.
if [ "$DETECTED" = "docker" ] && ! api_container_running; then
  echo "==> API container not running. Starting stack via scripts/docker-up.sh..."
  bash scripts/docker-up.sh up
fi

echo "==> Mode: $DETECTED (set FLOW_DESK_DB_MODE=docker|local to override)"

# Source .env in local mode (host-side prisma CLI / seed.cjs read DATABASE_URL
# from .env). In docker mode the container gets DATABASE_URL from
# docker-compose.yml's env block.
if [ "$DETECTED" = "local" ] && [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT_DIR/.env"
  set +a
fi

# Special handling for "seed": build on host, then run in the right place.
if [ "${1:-}" = "seed" ]; then
  shift
  SEED_CJS_HOST="$API_CWD/dist/seed.cjs"
  echo "==> Building seed.cjs on host"
  pnpm --filter @flow-desk/api exec esbuild ../../prisma/seed.ts \
    --bundle --platform=node --format=cjs \
    --outfile="$SEED_CJS_HOST" \
    --external:@prisma/client --external:bcryptjs

  if [ "$DETECTED" = "docker" ]; then
    # Resolve the api container id dynamically so a top-level `name:` change
    # in docker-compose.yml doesn't break the seed copy step.
    API_CID=$(docker compose ps -q api 2>/dev/null || true)
    if [ -z "$API_CID" ]; then
      echo "ERROR: api container not running after auto-start" >&2
      exit 1
    fi
    echo "==> docker — copying seed.cjs into api container ($API_CID)"
    docker cp "$SEED_CJS_HOST" "${API_CID}:/app/apps/api/dist/seed.cjs"
    echo "==> Running seed.cjs inside api container"
    docker compose exec -T api node /app/apps/api/dist/seed.cjs "$@"
  else
    echo "==> local — running seed.cjs on host"
    (cd "$API_CWD" && pnpm exec node dist/seed.cjs "$@")
  fi
  exit 0
fi

if [ "$DETECTED" = "docker" ]; then
  # Run prisma inside the api container. `-w` sets the working dir so we
  # don't need a wrapping `sh -c "cd ... && ..."` — which would force a
  # host-side word-split of "$*" and break args with spaces.
  # `pnpm exec prisma` picks up the local node_modules binary (NOT the root
  # `prisma` script, which would recurse into this wrapper).
  echo "==> docker compose exec -T -w /app/apps/api api pnpm exec prisma $*"
  docker compose exec -T -w /app/apps/api api pnpm exec prisma "$@"
else
  echo "==> pnpm exec prisma (cwd: $API_CWD)"
  (cd "$API_CWD" && pnpm exec prisma "$@")
fi
