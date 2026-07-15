# Plan 028 — Production readiness

**Status**: DONE (2026-07-15)

## Problem

Feature list and ROADMAP complete. Remaining gaps were ops/production hygiene:

- Dual env schemas (`packages/env` vs `apps/api/src/shared/lib/env.ts`)
- Liveness-only `/api/health` (no Postgres/Redis probe)
- Open `/metrics` with no optional auth
- Scattered `process.env` for `APP_URL` / `REDIS_URL` / Sentry
- Docker email-worker env var names wrong (`SMTP_PASS` vs `SMTP_PASSWORD`)

## Changes landed

1. Expand `@flowdesk/env` backend schema; thin API `env.ts` re-export
2. `GET /api/ready` + docker healthcheck
3. `METRICS_TOKEN` gate on `/metrics`
4. Extra security headers (API + nginx)
5. Centralize APP_URL / REDIS_URL / Sentry / integration secrets
6. Fix docker-compose email env; document in `.env.example`

## Verification

- api unit 149, integration 266, web 37, shared 31
- typecheck + build + lint + prettier green
