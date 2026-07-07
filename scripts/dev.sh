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

# --- DB reset (optional) ---
if [[ "${1:-}" == "reset" ]]; then
  log "Resetting database..."
  docker compose -f "$COMPOSE_FILE" down -v postgres 2>/dev/null || true
fi

# --- Infrastructure ---
log "Starting postgres + redis..."
# Use alternate ports if system services are running on defaults
POSTGRES_PORT_VAL=${POSTGRES_PORT:-5432}
REDIS_PORT_VAL=${REDIS_PORT:-6379}
if ss -tlnp | grep -q ":${POSTGRES_PORT_VAL}"; then
  POSTGRES_PORT_VAL=5433
  log "Port 5432 in use → mapping to 5433"
fi
if ss -tlnp | grep -q ":${REDIS_PORT_VAL}"; then
  REDIS_PORT_VAL=6380
  log "Port 6379 in use → mapping to 6380"
fi
POSTGRES_PORT=$POSTGRES_PORT_VAL REDIS_PORT=$REDIS_PORT_VAL docker compose -f "$COMPOSE_FILE" up -d $INFRA_SERVICES

# Update DATABASE_URL + REDIS_URL to match actual ports
if [ "$POSTGRES_PORT_VAL" != "5432" ]; then
  sed -i "s|localhost:5432|localhost:${POSTGRES_PORT_VAL}|g" .env
  log "DATABASE_URL → localhost:${POSTGRES_PORT_VAL}"
fi
if [ "$REDIS_PORT_VAL" != "6379" ]; then
  sed -i "s|localhost:6379|localhost:${REDIS_PORT_VAL}|g" .env
  sed -i "s|127.0.0.1:6379|127.0.0.1:${REDIS_PORT_VAL}|g" .env
  log "REDIS_URL → localhost:${REDIS_PORT_VAL}"
fi

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
