# Plan 026: Docs, DX, and public-API completeness

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 870c8ed..HEAD -- README.md docs/ CHANGELOG.md TASKS.md TASKS.md lefthook.yml .editorconfig packages/shared/src apps/api/src/modules/api-key docker/`
> If any in-scope file changed, compare "Current state" excerpts against
> the live code before proceeding; on a mismatch, treat it as a STOP
> condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs, dx
- **Planned at**: commit `870c8ed`, 2026-07-11

## Why this matters

10 separate findings cluster here:

- The README, USER.md, and TASKS.md are out of date by 5+ sprints; new
  contributors see a 1.0-era tour and miss the calendar, sprints,
  webhooks, automation, API keys, etc.
- `CHANGELOG.md` is frozen at 2026-07-07; the README links to it.
- `pnpm guardrails` is the documented "Layer 1" of the 5-layer
  enforcement stack in `AGENTS.md` but `lefthook.yml` doesn't call it.
- `.editorconfig` is missing; editor-default settings can fight Prettier
  on contrib machines.
- `/api/v1` (P4-4) is undocumented and ships only 2 read endpoints with
  no writes — the "open for extension" promise is decorative.
- `ApiKey` Zod schemas are inlined in the route, not shared with the
  FE — drift waiting to happen.
- 3 latent docker build bugs (documented in `claude-progress.md`) block
  the team from ever using the docker build path.

None are crash bugs. All are silent debt that compounds as contributors
arrive and the API surface grows.

## Current state

### DX-01 — `.editorconfig` missing

No `.editorconfig` in repo root. Only `.prettierrc.json` and
`eslint.config.mjs`.

### DX-02 — Test counts in docs are stale

`README.md:147` and `docs/DEV.md:99` quote "190 tests" / "220 tests";
actual per `claude-progress.md` is 250+ integration.

### DX-03 — `pnpm guardrails` not wired into pre-commit

`lefthook.yml` pre-commit runs secrets + format + eslint + 3
typechecks. `pnpm guardrails` (root `package.json:31`) is the documented
"Layer 1" per `AGENTS.md` but is never invoked.

### DX-04 — `ApiKey` Zod schemas not in shared

`packages/shared/src/` (23 files) has no `api-key.ts`.
`apps/api/src/modules/api-key/api-key.routes.ts:21-30` inlines the
schema. `apps/web/src/features/auth/pages/api-keys-settings.tsx` has
no shared schema import.

### DOCS-01 — `docs/USER.md` missing ~12 shipped features

Last touched 2026-07-07. Missing: 2FA/TOTP, webhooks, automation
rules, calendar view, sprint+estimation+burndown, recurring
tasks/templates, multi-board, epics/stories/subtasks, saved
views/filters, global search (Cmd+K), API keys, Slack/GitLab
integrations, email digests, in-app chat sidebar.

### DOCS-02 — No public API reference for `/api/v1`

Only `apps/web/src/features/auth/pages/api-keys-settings.tsx:56`
points to it. No `openapi.json`, no `swagger.json`, no `docs/API.md`.

### DOCS-03 — `CHANGELOG.md` frozen at 2026-07-07

17+ features shipped since the last entry. README links to it.

### DOCS-04 — Public API endpoint set narrower than ROADMAP scope

P4-4 promised tasks/workspaces/comments read + write endpoints. The
shipped surface (`apps/api/src/modules/api-key/api-key.routes.ts:70-120`)
is `GET /api/v1/workspaces` and `GET /api/v1/workspaces/:wid/tasks` (no
filters, no pagination, thin select, hard-coded `take: 100`). No
comments, no attachments, no webhooks (read), no automation-rule read,
no writes.

### TASKS-01 — `TASKS.md` historical-only

Last entries: Sprint 20 (P1-2 Saved Views). 17 features shipped since,
not in the file.

### DOCKER-01 — `docker/api.Dockerfile` + `email-worker.Dockerfile` 3 latent bugs

From `claude-progress.md` P4-3 session. The team's actual local-dev
path is `pnpm dev` (host-side tsx), so these never surfaced. Issues:

1. `COPY packages/db packages/env packages/env` typo (overwrites env
   with db).
2. `RUN pnpm install` runs before `COPY apps/api apps/api` so
   `apps/api/node_modules` symlinks never get created → `@hono/node-server`
   not linked.
3. `packages/db` exports `.ts` source but runtime stage has no
   transpile step → `Cannot find module '/app/packages/db/src/client'`.

### Repo conventions

- `.prettierrc.json` is the formatting source of truth (read it to
  derive `.editorconfig`).
- `AGENTS.md` "Architecture Standards" applies to docs/ structure.
- OpenAPI / zod-to-openapi: not vendored yet. If adding OpenAPI
  generation, add `@asteasolutions/zod-to-openapi` and
  `@hono/zod-openapi` to `apps/api/package.json`.
- Public API rate limit policy: `RATE_LIMITS.API_KEY` already in
  `apps/api/src/shared/lib/rate-limit-policies.ts`.

## Commands you will need

| Purpose   | Command                                                                                                | Expected on success |
| --------- | ------------------------------------------------------------------------------------------------------ | ------------------- |
| Typecheck | `pnpm typecheck`                                                                                       | exit 0              |
| Integ     | `TEST_DB_PORT=5433 pnpm --filter @flow-desk/api exec vitest run --config vitest.integration.config.ts` | all pass            |
| Guardrail | `pnpm guardrails secrets`                                                                              | exit 0              |
| Build     | `pnpm build`                                                                                           | exit 0              |

## Scope

**In scope**:

- `.editorconfig` (new)
- `README.md`, `docs/USER.md`, `docs/DEV.md`, `CHANGELOG.md`, `TASKS.md`
- `lefthook.yml` (add guardrails)
- `packages/shared/src/api-key.ts` (new) + `packages/shared/src/index.ts` (re-export)
- `apps/api/src/modules/api-key/api-key.routes.ts` (use shared schemas)
- `apps/web/src/features/auth/pages/api-keys-settings.tsx` (use shared schemas)
- `apps/api/src/modules/api-key/api-key.routes.ts` (expand `/api/v1` surface per DOCS-04)
- `apps/api/tests/integration/api-key.test.ts` (add tests for the new routes)
- `docker/api.Dockerfile`, `docker/email-worker.Dockerfile` (DOCKER-01)

**Out of scope**:

- Web bundle splitting (separate plan).
- OpenAPI generation tooling (separate decision; this plan only adds
  the write endpoints and rate-limit move, not OpenAPI itself).
- Adding 3rd-party integrations beyond what's already wired.
- TASKS.md backfill of all 17 missing sprints — this plan adds the
  freeze-header; backfill is a one-time chore, not on the critical
  path.

## Git workflow

- Branch: `advisor/026-docs-dx-api`
- One commit per step.
- Conventional commits: `docs(USER):`, `chore(editorconfig):`, `feat(shared): add api-key schemas`, `feat(api): add /api/v1 write endpoints`, `fix(docker): correct COPY typo + install order`.

## Steps

### Step 1 — DX-01: add `.editorconfig`

Create `/home/thanh/flow-desk/.editorconfig` mirroring Prettier's
resolved options:

```
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false

[Makefile]
indent_style = tab
```

**Verify**: `cat .editorconfig` returns the file. `pnpm exec prettier --check .` → "All matched files use Prettier code style!" (no regressions).

### Step 2 — DX-03: wire `pnpm guardrails` into pre-commit

In `lefthook.yml`, find the `pre-commit.commands` block. Add:

```yaml
guardrails-secrets:
  glob: '*'
  run: pnpm guardrails secrets
```

This is the secrets slice of guardrails (the existing pre-commit also
calls `bash .githooks/pre-commit` which does a secrets scan — the two
overlap but guardrails is the documented Layer 1 and should be
canonical).

**Verify**: `pnpm exec lefthook run pre-commit --all-files` → all stages including the new `guardrails-secrets` pass.

### Step 3 — DX-04 + shared api-key schemas

Create `packages/shared/src/api-key.ts`:

```ts
import { z } from 'zod';

export const apiKeyScopeSchema = z.enum(['read', 'write']);
export const apiKeyScopesSchema = z.array(apiKeyScopeSchema).default(['read']);

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(80),
  scopes: apiKeyScopesSchema,
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

export const apiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  scopes: z.array(z.string()),
  lastUsedAt: z.string().nullable(),
  createdAt: z.string(),
  revokedAt: z.string().nullable(),
});
export type ApiKey = z.infer<typeof apiKeySchema>;

// Re-export the plain key shape returned exactly once on create.
export const apiKeyCreatedSchema = apiKeySchema.extend({
  key: z.string().regex(/^fdkey_/),
});
export type ApiKeyCreated = z.infer<typeof apiKeyCreatedSchema>;
```

In `packages/shared/src/index.ts`, add `export * from './api-key';`.

In `apps/api/src/modules/api-key/api-key.routes.ts:21-30`, replace
the inline schemas with `import { createApiKeySchema, apiKeySchema,
apiKeyCreatedSchema } from '@flow-desk/shared/api-key';`.

In `apps/web/src/features/auth/pages/api-keys-settings.tsx`, do the
same import + use the shared types for the `useState` payload.

**Verify**: `pnpm typecheck` → exit 0. The existing
`tests/integration/api-key.test.ts` (1 test) still passes — the
internal call signature is unchanged.

### Step 4 — DOCS-04: expand `/api/v1` surface

In `apps/api/src/modules/api-key/api-key.routes.ts` (currently 70-120),
add to the existing public router:

```ts
// Cursor-paginated tasks list (mirrors /api/tasks shape, scope-checked)
publicV1Router.get('/workspaces/:wid/tasks', requireApiKey('read'), async (c) => {
  // Reuse task.service.list() with cursor pagination envelope
  // ...
});

// Task PATCH (write scope)
publicV1Router.patch('/workspaces/:wid/tasks/:taskId', requireApiKey('write'), async (c) => {
  // Reuse task.service.update() with assertMembership
  // ...
});

// Comments list (read)
publicV1Router.get('/workspaces/:wid/comments', requireApiKey('read'), async (c) => {
  // Reuse comment.service.list()
  // ...
});

// Webhooks list (read)
publicV1Router.get('/workspaces/:wid/webhooks', requireApiKey('read'), async (c) => {
  // Reuse webhook.service.list()
  // ...
});
```

Each new route calls the existing service so the write semantics (auth
cache, soft-delete, activity diff, position renumber, automation
fan-out) all stay correct. The `requireApiKey(scope)` helper is the
existing middleware at `api-key.routes.ts:55-65` (or wherever it lives
in the file).

Also move the rate-limit policy from inline in the route to
`RATE_LIMITS.API_KEY` in `apps/api/src/shared/lib/rate-limit-policies.ts`.

**Verify**:

- `pnpm typecheck` → exit 0
- Add 4 new tests in `tests/integration/api-key.test.ts`:
  1. `GET /api/v1/workspaces/:wid/tasks?status=DONE&cursor=…&limit=20` returns the cursor envelope.
  2. `PATCH /api/v1/workspaces/:wid/tasks/:id` with `scopes: ['read']` → 403.
  3. `PATCH /api/v1/workspaces/:wid/tasks/:id` with `scopes: ['read', 'write']` → 200, body updated.
  4. `GET /api/v1/workspaces/:wid/webhooks` returns the webhook list (not the secret).
- `TEST_DB_PORT=5433 pnpm --filter @flow-desk/api exec vitest run --config vitest.integration.config.ts tests/integration/api-key.test.ts` → 5 tests pass.

### Step 5 — DOCS-01: refresh `docs/USER.md`

Open `docs/USER.md`. Append (not replace — preserve troubleshooting
table at the end) a new H2 per shipped feature since 2026-07-07:

```
## 2FA / TOTP
Per-workspace 2FA with TOTP and 8 backup codes. Setup at /settings/security.
See: P1-5.

## Outgoing webhooks
Per-workspace HMAC-signed webhook delivery for any TaskActivity. CRUD at
/api/workspaces/:id/webhooks. See: P1-4.

## Automation rules
Per-workspace trigger/condition/action rules. CRUD at
/api/workspaces/:id/rules. See: P2-1.

## Calendar view
Month/week/day view of tasks by dueDate, drag-to-reschedule at
/calendar/:workspaceId. See: P3-3.

## Sprint + burndown
Estimation + sprint planning + burndown chart at /sprints/:workspaceId.
See: P3-1.

## Recurring tasks / templates
TaskTemplate + RecurringRule at /templates/:workspaceId. See: P3-2.

## Multiple boards per workspace
Marketing/Engineering/etc. boards, partition by boardId. See: P4-2.

## Epic / Story / Subtask hierarchy
Task.type EPIC|STORY|SUBTASK, nest via parentTaskId. See: P4-1.

## Saved views / filters
Save current filter as a named view, load later. See: P1-2.

## Global search (Cmd+K)
tsvector full-text across tasks, comments, attachments. See: P1-1.

## API keys
fdkey_… Bearer auth on /api/v1 routes. See: P4-4.

## Slack + GitLab OAuth integrations
Settings → Integrations tab. See: P4-3.

## Email digests
Per-workspace/per-user digest cadence. See: P2-2.

## In-app chat sidebar
Workspace-level channels + task-level chat. See: F7.
```

**Verify**: `git diff --stat docs/USER.md` shows ~80 lines added; `pnpm exec prettier --check docs/USER.md` → clean.

### Step 6 — DOCS-03: regenerate `CHANGELOG.md` [Unreleased]

The `changelog` skill (`.pi/agent/skills/changelog/SKILL.md`) regenerates
the `[Unreleased]` block from `git log --oneline` since the last tag.

Run the skill (or hand-roll if skill not available in the executor's
environment): produce a Conventional-Commits-classified list of commits
from `fc5cc0c..HEAD` (the last "feat/fix ROADMAP" tag boundary) and
rewrite the `[Unreleased]` section. Preserve any prior `[X.Y.Z]`
release sections.

**Verify**: `head -30 CHANGELOG.md` shows a fresh `[Unreleased]` block with the P1-4..P4-6 work (webhooks, 2FA, automation, calendar, sprints, templates, multi-board, epic, API keys, exports, a11y, integrations).

### Step 7 — TASKS-01: mark TASKS.md as historical

Add a header line at the top of `TASKS.md`:

```
# Tasks (historical — frozen 2026-07-05, end of Sprint 20)

> Active backlog lives in `feature_list.json` (last updated YYYY-MM-DD).
> This file is preserved for sprint history. New work is not added here.
```

Do not backfill the 17 missing sprints — that's a separate decision
(add to a future "sprint history" page if it becomes interesting).

**Verify**: `head -5 TASKS.md` shows the new header.

### Step 8 — DX-02: stop quoting test counts in docs

In `README.md:147` and `docs/DEV.md:99`, replace the hard-coded
"190 tests" / "220 tests" with a one-line note: "Test counts grow
each session; run `pnpm verify` for the current number." Optionally
add a `pnpm count:tests` script in `package.json` that greps `it(` in
the relevant trees — not required, just an option.

**Verify**: `grep -n "[0-9]\{2,\} tests" README.md docs/DEV.md` → 0 matches.

### Step 9 — DOCKER-01: fix the 3 latent docker build bugs

For each of `docker/api.Dockerfile` and `docker/email-worker.Dockerfile`:

**Bug 1**: Replace `COPY packages/db packages/env packages/env` (line 25 in both files) with:

```dockerfile
COPY packages/db ./packages/db
COPY packages/env ./packages/env
```

**Bug 2 (api.Dockerfile only)**: Reorder the `api-build` stage so the
`apps/api` source is copied **before** `pnpm install`:

```dockerfile
COPY apps/api/package.json apps/web/package.json packages/shared/package.json packages/env/package.json packages/db/package.json ./
# Copy source BEFORE install so pnpm can create per-package node_modules/
# linking transitive deps (e.g. @hono/node-server) for apps/api.
COPY apps/api apps/api
COPY prisma.config.ts ./
RUN pnpm install --no-frozen-lockfile
```

And in the runtime stage, also copy the apps/api/node_modules:

```dockerfile
COPY --from=api-build /app/node_modules node_modules
COPY --from=api-build /app/apps/api/node_modules apps/api/node_modules
```

**Bug 3 (out of scope for this plan)**: The `packages/db` exports `.ts`
source but runtime has no transpile step. The two options are:

- Add a `db-build` step that runs `pnpm --filter @flowdesk/db build` to
  produce `.js` artifacts, then copy the `dist/` instead of `src/`.
- Change the `@flowdesk/db` package.json `exports` to point at a
  pre-built `dist/index.js`.

Pick option 1 (less invasive). Add to the `db-build` stage in
`docker/api.Dockerfile`:

```dockerfile
RUN pnpm --filter @flowdesk/db build
```

And in the runtime stage:

```dockerfile
COPY --from=db-build /app/packages/db/dist packages/db/dist
COPY --from=db-build /app/packages/db/package.json packages/db/package.json
COPY --from=db-build /app/packages/db/prisma packages/db/prisma
```

Check `packages/db/package.json` `exports` to ensure `dist/index.js`
exists after build — if the build script emits to a different path,
adjust the runtime copy.

**Verify (best effort)**: `docker compose build api 2>&1 | tail -5` → "Image flow-desk-api Built" (this requires npm registry access; if it times out, document the build attempted but did not complete in this env — that's an env issue, not a code issue).

If the full docker build is not feasible in the executor's environment
(no Docker daemon, slow registry), skip the build verification and
rely on the Dockerfile syntax being correct. The plan is then
"static-only fix"; the team verifies the build on a machine with
Docker.

### Step 10 — full gate

`pnpm verify` — all 4 stages green. New tests:

- 4 new api-key integration tests (Step 4)
- 0 other new tests (this is a docs + DX + public-API plan; tests for
  new routes only)

Integration count: ≥ 254 (250 baseline + 4 new).

## Test plan

- All new code is covered by the 4 new api-key tests in Step 4.
- The shared schemas (Step 3) are tested implicitly through the api-key
  route test — if the shape drifts, the route test fails.
- The Dockerfile fix (Step 9) has no automated test in the repo's test
  suite (no docker test infra). Manual build verification per Step 9.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm --filter @flow-desk/api exec vitest run --config vitest.config.ts` exits 0
- [ ] `TEST_DB_PORT=5433 pnpm --filter @flow-desk/api exec vitest run --config vitest.integration.config.ts` exits 0; integration count ≥ 254
- [ ] `pnpm build` exits 0
- [ ] `pnpm guardrails secrets` exits 0
- [ ] `cat .editorconfig` non-empty
- [ ] `grep -rn "guardrails-secrets" lefthook.yml` returns ≥ 1
- [ ] `grep -rn "createApiKeySchema" packages/shared/src/api-key.ts` returns ≥ 1
- [ ] `grep -n "190 tests" README.md docs/DEV.md` returns 0
- [ ] `grep -n "Active backlog" TASKS.md` returns ≥ 1
- [ ] `grep -rn "P1-4\|P1-5\|P2-1\|P3-1\|P3-3\|P4-1\|P4-2\|P4-3\|P4-4" docs/USER.md` returns ≥ 1 per cited P-id (at least 9 matches)
- [ ] `git status` shows only in-scope files (Dockerfile changes are 2 files)
- [ ] `plans/README.md` row for 026 updated to `DONE`

## STOP conditions

- The `requireApiKey` middleware signature in `api-key.routes.ts`
  differs from what's documented here — read the file first to
  confirm.
- The api-key test factory helpers (`createApiKey`, `getApiKeyCookie`)
  don't exist — check `tests/setup/factories.ts` and add them in this
  plan if missing (in scope).
- The Dockerfile fix in Step 9 hits the existing pre-existing
  prisma-extension / pnpm npm-registry issue from the P4-3 session
  (`docker build` takes 5+ minutes due to slow registry). Set a
  long timeout (≥ 600s) for the build verification command.
- The CHANGELOG skill (Step 6) is not in the executor's environment —
  hand-roll the [Unreleased] block from `git log fc5cc0c..HEAD
--oneline`.

## Maintenance notes

- The new `/api/v1` write endpoints share the existing
  `task.service.update` semantics. Any future change to
  `assertMembership` (e.g. the BUG-04 fix in plan 023) flows through
  automatically.
- `docs/USER.md` should be regenerated at the end of every sprint
  (or the changelog skill should append to it). A 1-line
  `// TODO(USER.md): update at end of sprint` comment in the
  `claude-progress.md` template would help.
- The OpenAPI generation is intentionally deferred. When picked up,
  the schemas in `packages/shared/src/api-key.ts` are the right
  starting point — decorate with `.openapi(...)` and mount
  `@hono/swagger-ui` on `/api/v1/docs`.
- The Dockerfile fix is a one-shot. The team should also add
  `docker build` to the CI pipeline (out of scope) so future docker
  changes can't regress silently.
