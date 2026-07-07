#!/usr/bin/env bash
# scripts/dev-local.sh — DEPRECATED, use scripts/dev.sh instead.
echo "NOTE: dev-local.sh is deprecated. Use 'pnpm dev' instead."
exec bash "$(dirname "$0")/dev.sh" "$@"
