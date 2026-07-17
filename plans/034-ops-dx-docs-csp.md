# Plan 034: Honest Sentry/ops DX; fix docker LLM default; refresh docs; CSP report-only

> **Executor instructions**: Follow step by step. Verify each step. STOP → report. Update `plans/README.md` when done.
>
> **Drift check**:
> `git diff --stat 081cbc6..HEAD -- apps/api/src/shared/lib/sentry.ts docker-compose.yml packages/env docker/web.nginx.conf apps/api/src/app.ts session-handoff.md docs/ARCHITECTURE.md docs/DEV.md .env.example`
> Mismatch → STOP.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: MED for CSP only (start report-only)
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `081cbc6`, 2026-07-15

## Why this matters

Operators can set `SENTRY_DSN` and believe errors are captured, but `@sentry/node` is not a dependency — import fails silently. Docker Compose defaults `LLM_API_KEY` to `sk-placeholder`, which the unified env schema rejects, so API exits on boot. Handoff/architecture docs are stale (wrong plan status, RS256 JWT claim, wrong Prisma path). CSP is still absent after header hardening — add report-only to avoid breaking the SPA.

## Current state

### Sentry

`apps/api/src/shared/lib/sentry.ts` dynamic-imports `@sentry/node`; no package in any `package.json`.

### Docker LLM

`docker-compose.yml` ~12: `LLM_API_KEY: ${LLM_API_KEY:-sk-placeholder}`  
`packages/env/src/backend.ts` ~115–118 rejects `sk-placeholder`.

### Docs

- `session-handoff.md` still describes 2026-07-07 / remaining audit plans 001–008.
- `docs/ARCHITECTURE.md` claims RS256; code uses HS256 via `JWT_SECRET` (`apps/api/src/shared/lib/jwt.ts`).
- `docs/DEV.md` may still cite `apps/api/generated/prisma`; real output is `packages/db/generated`.

### Headers

API `app.ts` ~43–54 and `docker/web.nginx.conf` ~11–18: nosniff, frame, referrer, permissions, COOP, CORP; **no CSP**. HSTS on API production only.

### Phantom env (light cleanup)

`FLOWDESK_GITHUB_*` and `VITE_STRIPE_PUBLIC_KEY` documented without product surface — remove or clearly mark “unused / reserved”.

## Commands you will need

| Purpose                          | Command                           | Expected |
| -------------------------------- | --------------------------------- | -------- |
| Typecheck                        | `pnpm typecheck`                  | exit 0   |
| Lint/format                      | `pnpm lint` / `pnpm format:check` | exit 0   |
| Unit/integration if code touched | filter as needed                  | pass     |
| Full                             | `pnpm verify`                     | exit 0   |

## Scope

**In scope**:

- Sentry: **either** add `@sentry/node` as optional/runtime dependency and verify init, **or** make missing package log a clear **warn once** at startup and document “not installed” in `.env.example` / DEV.md. Prefer **installing** `@sentry/node` if license/size OK (check latest stable compatible with Node 20+).
- `docker-compose.yml` + `.env.example` LLM key alignment
- `session-handoff.md` rewrite from current `claude-progress.md`
- `docs/ARCHITECTURE.md` JWT algo + any wrong paths
- `docs/DEV.md` Prisma path + soft-delete path → `packages/db`
- `docker/web.nginx.conf` + optionally `apps/api/src/app.ts` CSP **Report-Only**
- Remove or mark dead env: GitHub OAuth + Stripe public key in `packages/env` + `.env.example` + `turbo.json` if listed
- Light dep cleanup if quick: drop unused `tailwindcss-animate` if truly unused (`apps/web/package.json`) — only if `rg` shows zero imports

**Out of scope**:

- Enforcing CSP (not report-only) without a report endpoint + multi-day browser QA
- Installing full frontend Sentry SDK (optional one-line note only)
- OpenAPI generation
- PDF regeneration of ARCHITECTURE.pdf (note “PDF may lag markdown” if present)

## Git workflow

- Commit example: `chore(ops): sentry honesty, docker llm default, docs, csp report-only`
- Do not push unless asked.

## Steps

### Step 1: Sentry package or honest no-op

**Preferred**:

```bash
pnpm --filter @flow-desk/api add @sentry/node
```

Ensure `initSentry` actually calls `Sentry.init` when DSN set. Add a unit test with mocked module **or** a smoke that `loadSentry` resolves when package present.

If install is blocked (network), instead:

- Log `logger.warn('SENTRY_DSN set but @sentry/node failed to load')` once.
- Update `.env.example`: “requires `pnpm add @sentry/node`”.

**Verify**: with DSN unset, boot path unchanged; with package installed, import succeeds in node REPL or unit mock.

### Step 2: Docker / env LLM default

1. Remove default `sk-placeholder` from compose; require:
   `LLM_API_KEY: ${LLM_API_KEY:?LLM_API_KEY must be set in .env}`  
   **or** for local dev compose override file only, use a documented mock that the schema allows.
2. Align `.env.example` with schema deny-list (do not suggest `sk-placeholder`).
3. If local AI-less dev is desired, add optional `LLM_API_KEY` refine exception only when `NODE_ENV=development` **and** a documented `LLM_MOCK=1` — only if product already supports AI fallback without key; otherwise requiring the var is fine (AI features degrade via existing R-01 fallback only when provider fails, not when env fails parse).

Simplest correct fix: compose requires real `LLM_API_KEY` like `JWT_SECRET`.

**Verify**: schema still rejects `sk-placeholder` in production; compose file no longer defaults to it.

### Step 3: session-handoff.md

Rewrite to current truth:

- Plans 001–028 DONE; new open plans 029–034 TODO
- Test counts from latest `claude-progress.md` (or “run pnpm verify”)
- Highest unfinished: execute advisor plans 029+; operator secrets for Sentry/OAuth
- Point to `./init.sh` and `claude-progress.md`

Keep it short (≤80 lines).

### Step 4: ARCHITECTURE + DEV accuracy

- JWT: HS256 (HMAC with `JWT_SECRET`), not RS256 — fix text.
- Prisma client: `packages/db/generated` via `@flowdesk/db`.
- Soft-delete extension: `packages/db/src/prisma-extension.ts`.
- Do not invent new architecture; only fix false statements.

### Step 5: CSP Report-Only

Add to `docker/web.nginx.conf`:

```
add_header Content-Security-Policy-Report-Only "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
```

Tune `connect-src` if API is on another origin in some deploys (same nginx proxies `/api` today — `'self'` OK).

Optional API header for JSON error pages is low value; nginx static is the SPA shell.

Do **not** switch to enforcing CSP in this plan.

**Verify**: config file contains `Content-Security-Policy-Report-Only`.

### Step 6: Dead env knobs

- Remove `FLOWDESK_GITHUB_*` from env schema + `.env.example` if no code references (`rg FLOWDESK_GITHUB`).
- Remove `VITE_STRIPE_PUBLIC_KEY` from frontend env + turbo if unused (`rg STRIPE`).
- If removal breaks typecheck of something unexpected → STOP and report.

**Verify**:

```bash
pnpm typecheck
pnpm --filter @flow-desk/api test:unit
```

## Test plan

- No behavior change expected for auth/business logic.
- Health integration still expects security headers; **do not** require CSP on API unless you add it — update test only if you add API CSP header.
- If Sentry package added, ensure docker build still works (optional local `docker compose build api` if environment allows — not required for DONE if network blocked).

## Done criteria

- [ ] Sentry either loads for real or warns clearly + docs match
- [ ] Compose does not default to schema-rejected LLM key
- [ ] `session-handoff.md` matches 2026-07-15 reality
- [ ] ARCHITECTURE/DEV JWT + Prisma paths corrected
- [ ] CSP-Report-Only on nginx
- [ ] Dead GitHub/Stripe env removed or marked unused
- [ ] typecheck (+ unit if code) green
- [ ] `plans/README.md` 034 → DONE

## STOP conditions

- Adding `@sentry/node` pulls conflicting peer deps that break build → fall back to warn-only path.
- CSP report-only string breaks nginx reload syntax → fix quoting; do not deploy enforcing CSP.
- Handoff is intentionally generated by a hook — if so, update the generator source instead of only the file (search `session-handoff` references).

## Maintenance notes

- Next step after report-only: collect violations, then enforce.
- Reviewers: no secrets in docs; no real DSNs.
- PDF under `docs/ARCHITECTURE.pdf` may lag — note in DEV if still linked.
