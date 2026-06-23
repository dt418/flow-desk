#!/usr/bin/env bash
# scripts/dev-local.sh — run api + web locally without Docker.
#
# Requirements:
#   - Node 20+ and pnpm 9+
#   - PostgreSQL 16 listening on localhost:5432 with credentials matching .env (DATABASE_URL)
#   - Redis 7 listening on localhost:6379 (REDIS_URL)
#
# This script does NOT start postgres/redis — it expects them already running locally
# (apt-installed, brew services, or whatever you prefer). For a fully-containerized
# setup, use scripts/docker-up.sh instead.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Sanity checks
command -v pnpm >/dev/null 2>&1 || { echo "ERROR: pnpm not installed. Run: npm i -g pnpm"; exit 1; }
command -v psql >/dev/null 2>&1 || echo "WARNING: psql not found — cannot verify Postgres connectivity"
command -v redis-cli >/dev/null 2>&1 || echo "WARNING: redis-cli not found — cannot verify Redis connectivity"

# Ensure .env exists (don't overwrite)
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    echo "==> Creating .env from .env.example"
    cp .env.example .env
    echo "    Edit .env to set JWT_SECRET and LLM_API_KEY before continuing."
    exit 1
  else
    echo "ERROR: no .env and no .env.example found"
    exit 1
  fi
fi

# Verify postgres reachable (if psql available)
if command -v psql >/dev/null 2>&1; then
  DB_URL=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)
  if [ -n "$DB_URL" ]; then
    echo "==> Checking Postgres reachability"
    if ! psql "$DB_URL" -c 'SELECT 1' >/dev/null 2>&1; then
      echo "ERROR: cannot reach Postgres at $DB_URL"
      echo "    Start postgres locally or run scripts/docker-up.sh instead."
      exit 1
    fi
    echo "    OK"
  fi
fi

# Verify redis reachable
if command -v redis-cli >/dev/null 2>&1; then
  echo "==> Checking Redis reachability"
  if ! redis-cli ping >/dev/null 2>&1; then
    echo "ERROR: cannot reach Redis on localhost:6379"
    echo "    Start redis locally or run scripts/docker-up.sh instead."
    exit 1
  fi
  echo "    OK"
fi

echo "==> Installing dependencies (pnpm install)"
pnpm install

echo "==> Building shared package (zod schemas + types)"
pnpm --filter @flow-desk/shared build

echo "==> Generating Prisma client"
pnpm --filter @flow-desk/api db:generate

echo "==> Running migrations (additive)"
pnpm --filter @flow-desk/api db:migrate:deploy

echo "==> Seeding demo data (idempotent — safe to re-run)"
pnpm --filter @flow-desk/api db:seed || echo "    (seed failed; continuing — DB may already be seeded)"

echo "==> Starting api + web in watch mode"
echo "    API:  http://localhost:3000"
echo "    Web:  http://localhost:5173"
echo ""
echo "    Demo creds: demo@flow-desk.app / demo1234"
echo ""
echo "    Ctrl-C to stop both."

# Trap SIGINT/SIGTERM to kill both children cleanly
trap 'echo "==> Stopping..."; kill 0' EXIT INT TERM

# Start shared (tsup watch) + api (tsx watch) + web (vite) in parallel.
# pnpm -r --parallel runs each filtered package's `dev` script concurrently.
# shared runs first-build via the `pnpm --filter @flow-desk/shared build` above,
# then tsup --watch keeps dist/ in sync; api's tsx watches its own src +
# ../../packages/shared/dist/**/*.js (set in apps/api/package.json dev script).
pnpm -r --parallel --filter @flow-desk/shared --filter @flow-desk/api --filter @flow-desk/web run dev