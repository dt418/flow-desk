#!/usr/bin/env bash
# Guardrails — automated safety checks for the FlowDesk repo.
# Runs in CI and optionally pre-commit. Fails fast on the first violation.
#
# Usage:
#   bash scripts/guardrails.sh          # run all checks
#   bash scripts/guardrails.sh secrets  # run one category
#   bash scripts/guardrails.sh --fix    # auto-fix what's safe to fix
#
# Categories: secrets large-files lockfile gitignore audit console

set -euo pipefail

RED=$'\033[0;31m'
YELLOW=$'\033[0;33m'
GREEN=$'\033[0;32m'
RESET=$'\033[0m'

FAIL=0
WARN=0

fail() { printf '%s✖ FAIL%s %s\n' "$RED" "$RESET" "$1" >&2; FAIL=$((FAIL + 1)); }
warn() { printf '%s⚠ WARN%s %s\n' "$YELLOW" "$RESET" "$1" >&2; WARN=$((WARN + 1)); }
ok()   { printf '%s✓ OK%s   %s\n' "$GREEN" "$RESET" "$1"; }

# ── Helpers ──────────────────────────────────────────────────────────────────

changed_files() {
  # Staged + committed files (for pre-commit context)
  local files
  files="$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || true)"
  if [ -z "$files" ]; then
    files="$(git diff --name-only --diff-filter=ACM HEAD~1 2>/dev/null || true)"
  fi
  echo "$files"
}

# ── Check: secrets ────────────────────────────────────────────────────────────

check_secrets() {
  bash .githooks/pre-commit 2>/dev/null && ok "secrets" || fail "secrets — secret pattern detected"
}

# ── Check: large files ────────────────────────────────────────────────────────

check_large_files() {
  local max_bytes=$((1024 * 1024))  # 1 MB
  local violations=0

  while IFS= read -r file; do
    [ -z "$file" ] && continue
    # Skip known-safe paths
    case "$file" in
      node_modules/*|dist/*|.turbo/*|pnpm-lock.yaml|*.min.js|*.min.css) continue ;;
    esac
    if [ -f "$file" ]; then
      local size
      size="$(wc -c < "$file" 2>/dev/null || echo 0)"
      if [ "$size" -gt "$max_bytes" ]; then
        local size_kb=$((size / 1024))
        warn "large file: $file (${size_kb}KB > 1024KB)"
        violations=$((violations + 1))
      fi
    fi
  done < <(changed_files)

  if [ "$violations" -gt 0 ]; then
    fail "large-files — $violations file(s) exceed 1MB. Use Git LFS or compress."
  else
    ok "large-files"
  fi
}

# ── Check: lockfile integrity ─────────────────────────────────────────────────

check_lockfile() {
  local pkg_changed=0
  local lock_changed=0

  while IFS= read -r file; do
    [ -z "$file" ] && continue
    case "$file" in
      package.json) pkg_changed=1 ;;
      pnpm-lock.yaml) lock_changed=1 ;;
    esac
  done < <(changed_files 2>/dev/null)

  if [ "$pkg_changed" -eq 1 ] && [ "$lock_changed" -eq 0 ]; then
    fail "lockfile — package.json changed but pnpm-lock.yaml did not. Run: pnpm install"
  else
    ok "lockfile"
  fi
}

# ── Check: gitignore coverage ─────────────────────────────────────────────────

check_gitignore() {
  # These are the exact glob patterns that should appear in .gitignore files
  local required_patterns=(
    '.env'
    '.env.local'
    '.env.*.local'
    'node_modules'
    '.turbo'
    'dist'
    'coverage'
    '.DS_Store'
    '*.log'
  )
  local missing=0

  # Collect all .gitignore files in the repo
  local gitignore_files
  gitignore_files="$(find . -name '.gitignore' -not -path '*/node_modules/*' -not -path '*/.turbo/*' 2>/dev/null)"

  for pattern in "${required_patterns[@]}"; do
    local found=0
    while IFS= read -r gi; do
      [ -z "$gi" ] && continue
      if grep -qF "$pattern" "$gi" 2>/dev/null; then
        found=1
        break
      fi
    done <<< "$gitignore_files"
    if [ "$found" -eq 0 ]; then
      warn "gitignore — missing pattern: $pattern"
      missing=$((missing + 1))
    fi
  done

  # Check that .env files are actually ignored
  if git check-ignore -q .env 2>/dev/null; then
    ok "gitignore — .env is ignored"
  else
    warn "gitignore — .env is NOT ignored"
    missing=$((missing + 1))
  fi

  if [ "$missing" -gt 0 ]; then
    fail "gitignore — $missing pattern(s) missing or not enforced"
  else
    ok "gitignore"
  fi
}

# ── Check: dependency audit ───────────────────────────────────────────────────

check_audit() {
  if pnpm audit --audit-level=high 2>/dev/null; then
    ok "audit"
  else
    fail "audit — high-severity vulnerabilities found. Run: pnpm audit"
  fi
}

# ── Check: console.log in source (not tests/scripts) ──────────────────────────

check_console() {
  local violations=0
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    case "$file" in
      *.test.ts|*.test.tsx|*.spec.ts|*.spec.tsx|scripts/*|*.config.*|*worker*) continue ;;
    esac
    case "$file" in
      *.ts|*.tsx)
        local count
        count="$(grep -cE 'console\.(log|debug|info)\(' "$file" 2>/dev/null)" || true
        count="${count:-0}"
        count="$(echo "$count" | tr -d '[:space:]')"
        if [ "$count" -gt 0 ] 2>/dev/null; then
          warn "console.log in $file ($count occurrence(s))"
          violations=$((violations + 1))
        fi
        ;;
    esac
  done < <(changed_files)

  if [ "$violations" -gt 0 ]; then
    fail "console — $violations file(s) have console.log in source code. Use logger."
  else
    ok "console"
  fi
}

# ── Main ──────────────────────────────────────────────────────────────────────

CATEGORY="${1:-all}"

run_check() {
  local name="$1"
  if [ "$CATEGORY" = "all" ] || [ "$CATEGORY" = "$name" ]; then
    "check_$name"
  fi
}

printf '\n🛡️  FlowDesk Guardrails\n\n'

run_check secrets
run_check large_files
run_check lockfile
run_check gitignore
run_check audit
run_check console

printf '\n'

if [ "$FAIL" -gt 0 ]; then
  printf '%s❌ %d failure(s), %d warning(s)%s\n' "$RED" "$FAIL" "$WARN" "$RESET"
  exit 1
elif [ "$WARN" -gt 0 ]; then
  printf '%s⚠️  0 failure(s), %d warning(s)%s\n' "$YELLOW" "$WARN" "$RESET"
  exit 0
else
  printf '%s✅ All guardrails passed%s\n' "$GREEN" "$RESET"
  exit 0
fi
