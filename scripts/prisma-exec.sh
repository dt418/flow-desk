#!/usr/bin/env bash
# scripts/prisma-exec.sh — run prisma commands inside the api container.
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
#   scripts/prisma-exec.sh seed   → builds seed.cjs on host then runs inside container
#
# This is the right way to run prisma from the host shell. The api container has
# docker network access to the postgres container (hostname `postgres`), so its
# DATABASE_URL resolves. The root .env on the host uses the same `postgres:5432`
# hostname, which does NOT resolve from the host shell — that's why
# `pnpm prisma ...` from root fails with P1001.
#
# If the api container isn't running, this script starts it first via
# scripts/docker-up.sh.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Ensure api container is running
if ! docker compose ps --status running --services 2>/dev/null | grep -q '^api$'; then
  echo "==> API container not running. Starting stack via scripts/docker-up.sh..."
  bash scripts/docker-up.sh up
fi

# Special handling for "seed": build seed.cjs on host, copy into container, run there
if [ "${1:-}" = "seed" ]; then
  shift
  SEED_CJS_HOST="$ROOT_DIR/apps/api/dist/seed.cjs"
  SEED_CJS_CONT="/app/apps/api/dist/seed.cjs"
  echo "==> Building seed.cjs on host"
  pnpm --filter @flow-desk/api exec esbuild ../../prisma/seed.ts \
    --bundle --platform=node --format=cjs \
    --outfile="$SEED_CJS_HOST" \
    --external:@prisma/client --external:bcryptjs
  echo "==> Copying seed.cjs into api container"
  docker cp "$SEED_CJS_HOST" "flow-desk-api-1:$SEED_CJS_CONT"
  echo "==> Running seed.cjs inside api container"
  docker compose exec -T api node /app/apps/api/dist/seed.cjs "$@"
  exit 0
fi

# Pass args through to prisma inside the api container.
# Use `pnpm exec prisma` so it picks up the binary from node_modules, NOT the
# root package.json `prisma` script (which would recurse into this wrapper).
# Also `cd /app/apps/api` first so the schema path is correct.
echo "==> docker compose exec api sh -c 'cd /app/apps/api && pnpm exec prisma $*'"
docker compose exec api sh -c "cd /app/apps/api && pnpm exec prisma $*"