#!/usr/bin/env bash
# scripts/docker-up.sh — smart docker compose up with port-override detection.
#
# Detects port conflicts on 5432 (postgres) and 6379 (redis) before bringing the
# stack up. If a host-side postgres or redis is already bound to those ports,
# this script overrides POSTGRES_PORT and REDIS_PORT to free alternatives so the
# flow-desk containers don't collide.
#
# Override explicitly:
#   POSTGRES_PORT=5433 REDIS_PORT=6380 scripts/docker-up.sh
#
# Build images before starting (pass --build to rebuild):
#   scripts/docker-up.sh --build
#
# Stop everything:
#   scripts/docker-up.sh down

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Pick a free host port starting from the requested one
pick_free_port() {
  local start=$1
  local port=$start
  while [ "$port" -lt $((start + 100)) ]; do
    if ! (ss -ltn 2>/dev/null || netstat -ltn 2>/dev/null) | grep -qE "[:.]$port[[:space:]]"; then
      echo "$port"
      return 0
    fi
    port=$((port + 1))
  done
  echo "ERROR: no free port in range $start..$((start + 99))" >&2
  return 1
}

# Ensure .env exists
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    echo "==> Creating .env from .env.example"
    cp .env.example .env
    echo "    Edit .env to set JWT_SECRET and LLM_API_KEY before continuing."
    echo "    Re-run this script after editing."
    exit 1
  else
    echo "ERROR: no .env and no .env.example found"
    exit 1
  fi
fi

# Load .env vars into current shell (don't export secrets to logs)
set -a
. ./.env
set +a

# Detect port conflicts
PG_PORT=${POSTGRES_PORT:-5432}
REDIS_PORT_VAL=${REDIS_PORT:-6379}

PG_OVERRIDE=""
REDIS_OVERRIDE=""

if (ss -ltn 2>/dev/null || netstat -ltn 2>/dev/null) | grep -qE "[:.]$PG_PORT[[:space:]]"; then
  NEW_PG=$(pick_free_port 5433)
  PG_OVERRIDE="$NEW_PG"
  echo "==> Port $PG_PORT already in use (host postgres?), mapping flow-desk postgres to $NEW_PG"
fi

if (ss -ltn 2>/dev/null || netstat -ltn 2>/dev/null) | grep -qE "[:.]$REDIS_PORT_VAL[[:space:]]"; then
  NEW_REDIS=$(pick_free_port 6380)
  REDIS_OVERRIDE="$NEW_REDIS"
  echo "==> Port $REDIS_PORT_VAL already in use (host redis?), mapping flow-desk redis to $NEW_REDIS"
fi

# Build compose command
CMD=(docker compose)

# Handle subcommands
case "${1:-up}" in
  up)
    CMD+=("up" "-d")
    [ "${1:-}" != "up" ] && shift || true
    [ "${1:-}" = "--build" ] && { CMD+=("--build"); shift; }
    ;;
  down)
    CMD+=("down")
    shift
    ;;
  logs)
    CMD+=("logs" "-f")
    shift
    ;;
  restart)
    CMD+=("restart")
    shift
    ;;
  ps)
    CMD+=("ps")
    shift
    ;;
  *)
    echo "Usage: $0 [up|--build|down|logs|restart|ps]"
    exit 1
    ;;
esac

# Apply port overrides
if [ -n "$PG_OVERRIDE" ]; then
  POSTGRES_PORT="$PG_OVERRIDE" "${CMD[@]}"
elif [ -n "$REDIS_OVERRIDE" ]; then
  REDIS_PORT="$REDIS_OVERRIDE" "${CMD[@]}"
else
  "${CMD[@]}"
fi

# Wait for healthy (only on up)
if [[ "${CMD[*]}" == *"up"* ]]; then
  echo ""
  echo "==> Waiting for services to become healthy..."
  for i in 1 2 3 4 5 6 7 8 9 10; do
    sleep 2
    HEALTHY=$(docker compose ps --format json 2>/dev/null | grep -c '"Health":"healthy"' || echo 0)
    TOTAL=$(docker compose ps --format json 2>/dev/null | grep -c '"Service"' || echo 0)
    echo "    $HEALTHY/$TOTAL services healthy"
    if [ "$HEALTHY" -ge 2 ] && [ "$HEALTHY" -eq "$TOTAL" ]; then
      break
    fi
  done

  echo ""
  echo "==> Stack is up."
  echo "    Web: http://localhost:5173"
  echo "    API: http://localhost:3000/api/health"
  echo "    Demo creds: demo@flow-desk.app / demo1234"
  if [ -n "$PG_OVERRIDE" ] || [ -n "$REDIS_OVERRIDE" ]; then
    echo ""
    echo "    Note: host ports overridden (PG=$PG_OVERRIDE REDIS=$REDIS_OVERRIDE). Re-run with same"
    echo "    env vars to reconnect: POSTGRES_PORT=$PG_OVERRIDE REDIS_PORT=$REDIS_OVERRIDE $0"
  fi
fi