#!/usr/bin/env bash
# scripts/dev.sh — one-command local dev with docker infrastructure.
#
# Starts postgres + redis via docker, then runs api + web locally with hot-reload.
# Infrastructure stays running in background; app processes run directly on host.
#
# Usage:
#   pnpm dev          # or: ./scripts/dev.sh
#   pnpm dev:reset    # reset DB before starting

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# --- Config ---
COMPOSE_FILE="docker-compose.yml"
INFRA_SERVICES="postgres redis"
APP_SERVICES="@flow-desk/shared @flow-desk/api @flow-desk/web"

# --- Helpers ---
log()  { echo -e "\033[1;34m==>\033[0m $1"; }
err()  { echo -e "\033[1;31mERR\033[0m $1" >&2; exit 1; }

cleanup() {
  trap - EXIT INT TERM  # prevent re-entry
  log "Stopping..."
  kill 0 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# --- Preflight ---
command -v pnpm >/dev/null 2>&1 || err "pnpm not found. Run: npm i -g pnpm"
command -v docker >/dev/null 2>&1 || err "docker not found."

if [ ! -f .env ]; then
  [ -f .env.example ] || err "No .env and no .env.example"
  cp .env.example .env
  log "Created .env from .env.example — edit JWT_SECRET and LLM_API_KEY"
  exit 1
fi

# Source .env into this shell so POSTGRES_PORT / REDIS_PORT / etc. are visible
# to the compose port mapping and our busy-checks. (docker-compose reads .env
# itself, but $VAR expansions in this script need them exported here.)
set -a
. ./.env
set +a
# --- DB reset (optional) ---
if [[ "${1:-}" == "reset" ]]; then
  log "Resetting database..."
  docker compose -f "$COMPOSE_FILE" down -v postgres 2>/dev/null || true
fi

# --- Infrastructure ---
log "Starting postgres + redis..."
# Ports come from .env (POSTGRES_PORT / REDIS_PORT). No silent remap, no .env
# mutation — that sticky sed-rewrite corrupted .env across runs (REDIS_PORT=6379
# but REDIS_URL=...:6380 from a prior remap) → ECONNREFUSED → ioredis crash →
# dev tree died. Now: declare ports in .env, and `compose up -d` errors loud if
# the host-side port bind conflicts with a foreign service.
PG_PORT=${POSTGRES_PORT:-5432}
RD_PORT=${REDIS_PORT:-6379}
# Assert .env URL ports match the compose ports (the exact mismatch that bit us).
grep -q "localhost:${PG_PORT}/" .env || err ".env DATABASE_URL must use localhost:${PG_PORT} (matches POSTGRES_PORT=${PG_PORT})"
grep -q ":${RD_PORT}" .env || err ".env REDIS_URL must use :${RD_PORT} (matches REDIS_PORT=${RD_PORT})"
docker compose -f "$COMPOSE_FILE" up -d $INFRA_SERVICES

log "Waiting for services to be healthy..."
timeout=30
until docker compose -f "$COMPOSE_FILE" ps --format json $INFRA_SERVICES 2>/dev/null | grep -q '"healthy"' || [ $timeout -le 0 ]; do
  sleep 1
  timeout=$((timeout - 1))
done
[ $timeout -le 0 ] && err "Infrastructure failed to start within 30s"

log "Infra ready ✓"

# --- App setup ---
log "Installing dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

log "Building shared package..."
pnpm --filter @flow-desk/shared build

log "Generating Prisma client..."
FLOW_DESK_DB_MODE=local pnpm --filter @flow-desk/api db:generate

log "Running migrations..."
FLOW_DESK_DB_MODE=local pnpm --filter @flow-desk/api db:migrate-deploy

log "Seeding database..."
FLOW_DESK_DB_MODE=local pnpm --filter @flow-desk/api db:seed || log "(seed skipped — DB may already have data)"

# --- Port hygiene ---
check_port() {
  local port=$1 name=$2
  if ss -tlnp 2>/dev/null | grep -q ":${port} "; then
    err "Port ${port} (${name}) already in use (likely stale dev session) — Find: lsof -i :${port} | Kill: pkill -9 -f 'vite|tsx watch' && pkill -9 -f 'pnpm.*dev' | Then rerun: pnpm dev"
  fi
}
check_port 3000 "API"
check_port 5173 "Web"

# --- Dev servers ---
log "Starting dev servers..."
echo ""
echo "  API:  http://localhost:3000"
echo "  Web:  http://localhost:5173"
echo ""
echo "  Demo: demo@flow-desk.app / demo1234"
echo ""
echo "  Ctrl-C to stop"
echo ""

pnpm -r --parallel --filter @flow-desk/shared --filter @flow-desk/api --filter @flow-desk/web run dev
