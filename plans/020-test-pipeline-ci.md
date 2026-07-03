# Plan 020 — Test Pipeline: CI Unit Tests

**Findings:** TC-03
**Commit:** `732acb4`
**Effort:** S | **Risk:** LOW | **Files:** 2

## Problem

Unit tests (`pnpm --filter @flow-desk/api test`) are not in any CI or git hook pipeline (lefthook.yml:33). All unit tests run only manually. Regressions in mocked service logic go undetected.

## Changes

### 1. Add unit tests to lefthook pre-push

**File:** `lefthook.yml`

```yaml
pre-push:
  commands:
    unit-tests:
      run: pnpm --filter @flow-desk/api test
      skip:
        - run: test -n "$(git diff --name-only HEAD)" # skip if uncommitted changes
```

### 2. Add unit test job to CI

**File:** `.github/workflows/ci.yml`

Add a new job after `quality`:

```yaml
unit-tests:
  runs-on: ubuntu-latest
  timeout-minutes: 10
  env:
    DATABASE_URL: postgresql://placeholder:placeholder@localhost:5432/placeholder
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with:
        node-version: ${{ env.NODE_VERSION }}
        cache: 'pnpm'
    - run: pnpm install --frozen-lockfile
    - run: pnpm --filter @flow-desk/shared build
    - run: pnpm --filter @flowdesk/db db:generate
    - run: pnpm --filter @flow-desk/api test
```

Note: Unit tests use mocked DB/Redis, so no services needed. The `DATABASE_URL` is a placeholder since Prisma client generation requires it, but tests mock the actual queries.

## Verification

```bash
# 1. Run unit tests locally
pnpm --filter @flow-desk/api test

# 2. Check lefthook config is valid
pnpm setup:lefthook
```

## Scope

- `lefthook.yml`
- `.github/workflows/ci.yml`
