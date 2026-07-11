# Plan 023: Auth + OAuth security gaps

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 870c8ed..HEAD -- apps/api/src/modules/auth apps/api/src/shared/lib/access.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: none
- **Category**: security, bug
- **Planned at**: commit `870c8ed`, 2026-07-11
- **Issue**: (none — internal audit only)

## Why this matters

Three classes of auth surface — OAuth callback, login/register, and the
`assertMembership` tenant gate — have small defects that either surface as
500s (leaking account state to attackers), or open a soft-deleted workspace
to a former member (defense-in-depth hole), or weaken the OAuth CSRF
mitigation. The OAuth callback cluster (SEC-01, SEC-07) is a single env
var misconfiguration away from an open-redirect; the soft-delete ×
unique-constraint cluster (SEC-02, BUG-06, SEC-03 partial) leaks "this
email is registered" to attackers via 500-vs-401 differentiation; and
`assertMembership` ignoring the parent `Workspace.deletedAt` (BUG-04) lets
former members act on deleted workspaces until a manual cascade runs.

## Current state

### SEC-01 — OAuth callback open-redirect

`apps/api/src/modules/auth/auth.routes.ts:354` ends the Google OAuth
callback with:

```ts
c.redirect(`${env.CORS_ORIGINS[0]}/`);
```

No allowlist, no format check, no fallback when `CORS_ORIGINS` is empty or
malformed.

### SEC-07 — oauth_state cookie missing `Secure` attribute

`apps/api/src/modules/auth/auth.routes.ts:312`:

```ts
setCookie(c, 'oauth_state', state, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 600 });
```

Compare with the auth cookies at `auth.routes.ts:41, 48` which set
`secure: env.NODE_ENV === 'production'`.

### SEC-02 + BUG-06 — login/register race soft-delete

`auth.routes.ts:55-62` (register) and `:108-114` (login) both call
`prisma.user.findUnique({ where: { email } })`. The
`packages/db/src/prisma-extension.ts` (lines 96–119) `findUnique` branch
returns `null` for soft-deleted rows, and the
`packages/db/src/prisma-extension.ts:7` set `SOFT_DELETE_MODELS` includes
`User`. For register: `null` → `tx.user.create({ data: { email } })` →
unique-constraint violation on `User.email @unique`
(`packages/db/prisma/schema.prisma:81`) → 500. For login: `null` → throws
`Invalid credentials` (acceptable, but indistinguishable from a never-registered
email).

### BUG-04 — assertMembership ignores Workspace soft-delete

`apps/api/src/shared/lib/access.ts:3-9`:

```ts
export async function assertMembership(workspaceId: string, userId: string) {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!member) throw new UnauthorizedError('Not a member');
}
```

Does not check `Workspace.deletedAt`. `Workspace` is in `SOFT_DELETE_MODELS`.

### Repo conventions (apply to every step)

- Error throwing: import from `apps/api/src/shared/errors/` —
  `BadRequestError`, `UnauthorizedError`, `NotFoundError`, `ConflictError`,
  `ForbiddenError`. See `apps/api/src/modules/auth/auth.routes.ts:1-30` for
  the existing import block.
- Env access: `env.NODE_ENV`, `env.CORS_ORIGINS` come from
  `apps/api/src/shared/lib/env.ts` (re-exported from
  `packages/env/src/backend.ts`).
- Zod-validated query: `zValidator('query', schema)` from
  `@hono/zod-validator`; schema from `packages/shared/src/<feature>.ts`.
- Integration test pattern: see
  `apps/api/tests/integration/integrations.test.ts:1-30` for the
  `buildApp()` + `app.request()` + `cleanDatabase(prisma)` flow.

## Commands you will need

| Purpose   | Command                                                                        | Expected on success  |
| --------- | ------------------------------------------------------------------------------ | -------------------- |
| Typecheck | `pnpm --filter @flow-desk/api typecheck`                                       | exit 0, no errors    |
| Unit      | `pnpm --filter @flow-desk/api exec vitest run --config vitest.config.ts`       | all pass             |
| Integ     | `TEST_DB_PORT=5433 pnpm exec vitest run --config vitest.integration.config.ts` | all pass             |
| Lint      | `pnpm --filter @flow-desk/api lint`                                            | exit 0 (warnings OK) |

## Scope

**In scope** (the only files you should modify):

- `apps/api/src/modules/auth/auth.routes.ts`
- `apps/api/src/shared/lib/access.ts`
- `apps/api/src/shared/lib/env.ts` (only if adding the OAUTH_REDIRECT env — see Step 1)
- `packages/env/src/backend.ts` (mirror the new env var)
- `apps/api/tests/integration/auth-2fa.test.ts` (add regression cases for SEC-02/BUG-06)
- `apps/api/tests/integration/soft-delete.test.ts` (add regression case for BUG-04)

**Out of scope** (do NOT touch, even though they look related):

- `apps/api/src/modules/integrations/integrations.routes.ts` — P4-3 OAuth
  follows a different shape (state-cookie + workspace-cookie pair, sets
  `oauth_state` itself with the right flags). Do not change.
- `packages/db/prisma/schema.prisma` — the partial-unique-index migration
  (SEC-03 full fix) is out of scope here; the `register` regression test
  documents the partial-fix boundary.
- Other `setCookie` calls (login/register/refresh cookies) — those are not
  the OAuth state cookie.
- `assertMembership` callers (assertMembership is called from many modules;
  changing the helper signature is fine, but do not refactor call sites).

## Git workflow

- Branch: `advisor/023-auth-oauth-security`
- Commit per step; message style: conventional commits, e.g.
  `fix(auth): secure oauth_state cookie in production` —
  see recent `feat(p4-3):` commits for shape.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1 — SEC-07: add `secure` to oauth_state cookie

In `apps/api/src/modules/auth/auth.routes.ts:312` and the matching
`oauth_workspace` / `oauth_user` set on the same route (find the
`setCookie(c, 'oauth_state'…` block — there is one in the Google OAuth
connect handler; mirror the shape), add `secure: env.NODE_ENV === 'production'`
to each cookie's options object.

**Verify**: `grep -n "oauth_state" apps/api/src/modules/auth/auth.routes.ts` →
expect 4 occurrences (1 set + 1 get + 1 delete + state-cookie usage in
callback handler). All four should reference the same options-shape.

### Step 2 — SEC-01: replace `CORS_ORIGINS[0]` redirect with allowlist

In `apps/api/src/modules/auth/auth.routes.ts:354`, replace the
`c.redirect(\`${env.CORS_ORIGINS[0]}/\`)` line with a function call to a
new helper exported from the same file:

```ts
function postLoginRedirect(c: Context): Response {
  const allowed = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length === 0) {
    // Misconfiguration must not silently open-redirect. Log + 500.
    logger.error({ event: 'oauth.postlogin.no_cors_origins' }, 'CORS_ORIGINS empty');
    throw new Error('CORS_ORIGINS not configured');
  }
  const target = allowed[0]!;
  // Validate: must be http(s) URL, no userinfo, no path traversal.
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    throw new Error(`CORS_ORIGINS[0] not a URL: ${target}`);
  }
  if (!/^https?:$/.test(url.protocol))
    throw new Error(`CORS_ORIGINS[0] bad protocol: ${url.protocol}`);
  return c.redirect(`${url.origin}/`);
}
```

Replace the `c.redirect(...)` line at `:354` with `return postLoginRedirect(c)`.

**Verify**: `grep -n "CORS_ORIGINS\[0\]" apps/api/src/modules/auth/auth.routes.ts` → 0 matches.

### Step 3 — BUG-04: assertMembership checks Workspace.deletedAt

In `apps/api/src/shared/lib/access.ts`, change the function to:

```ts
export async function assertMembership(workspaceId: string, userId: string) {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!member) throw new UnauthorizedError('Not a member');
  // Defense in depth: if the workspace itself was soft-deleted, the member
  // row survives (no cascade). Reject so all downstream calls treat the
  // workspace as gone.
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { deletedAt: true },
  });
  if (!ws || ws.deletedAt) throw new NotFoundError('Workspace not found');
}
```

Add `NotFoundError` to the existing import from `../errors` (check
`apps/api/src/shared/errors/index.ts` to confirm the export name).

**Verify**: `pnpm --filter @flow-desk/api typecheck` → exit 0.

### Step 4 — SEC-02 + BUG-06: register does not 500 on soft-deleted email

In `apps/api/src/modules/auth/auth.routes.ts`, the register handler
(around `:55-62`) currently does:

```ts
const existing = await prisma.user.findUnique({ where: { email } });
if (existing) throw new ConflictError('Email already registered');
```

The `findUnique` returns `null` for soft-deleted users (per the
extension). The follow-up `tx.user.create` then hits the `@unique`
constraint on `User.email` and 500s.

Change the pre-check to:

```ts
const existing = await prisma.user.findFirst({
  where: { email, deletedAt: { not: null } },
});
if (existing) {
  // Soft-deleted account with this email exists. Two safe paths:
  // (a) reject with the same 409 the live-collision path uses — the user
  //     knows the email is taken, and the response is identical regardless
  //     of whether the existing row is soft-deleted.
  // (b) undelete + relink — out of scope here (cross-workspace data ownership
  //     questions).
  throw new ConflictError('Email already registered');
}
```

This makes the response byte-identical to a live-collision, so an attacker
cannot probe for soft-deleted accounts.

For login (around `:108-114`), change the pre-check to:

```ts
const user = await prisma.user.findFirst({
  where: { email, deletedAt: null },
});
if (!user) throw new UnauthorizedError('Invalid credentials');
```

This is a behavior change: soft-deleted accounts now get the same
"Invalid credentials" as a never-registered email (was already true via
the extension's null-return — but now it's explicit). Login flow otherwise
unchanged.

**Verify**: `pnpm --filter @flow-desk/api typecheck` → exit 0.

### Step 5 — regression tests

Add to `apps/api/tests/integration/auth-2fa.test.ts` (or `auth.test.ts` if
2fa is inlined there) — model after the existing structure:

```ts
it('register on soft-deleted email returns 409 (not 500)', async () => {
  // pre-create a user, then soft-delete via raw SQL
  const u = await createUser(prisma, 'softreg@test.local', 'Name');
  await prisma.$executeRawUnsafe(`UPDATE "User" SET "deletedAt" = NOW() WHERE id = '${u.id}'`);
  const app = buildApp();
  const res = await app.request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'softreg@test.local', name: 'Other', password: 'Test1234' }),
  });
  expect(res.status).toBe(409);
});
```

Add to `apps/api/tests/integration/soft-delete.test.ts`:

```ts
it('assertMembership rejects when Workspace is soft-deleted', async () => {
  const { ownerId, wid } = await setupOwnerWorkspace();
  await prisma.$executeRawUnsafe(`UPDATE "Workspace" SET "deletedAt" = NOW() WHERE id = '${wid}'`);
  const cookie = await getAuthCookie(prisma, ownerId);
  const app = buildApp();
  // Hit any endpoint that calls assertMembership; use a cheap read:
  const res = await app.request(`/api/workspaces/${wid}`, {
    headers: { Cookie: cookie },
  });
  expect(res.status).toBe(404);
});
```

If the existing `setupOwnerWorkspace` helper does not return a `cookie`
field, look at the `auth-2fa.test.ts` factory `getAuthCookie(prisma, userId)`
and use that.

**Verify**:

```
TEST_DB_PORT=5433 pnpm exec vitest run --config vitest.integration.config.ts tests/integration/auth-2fa.test.ts
TEST_DB_PORT=5433 pnpm exec vitest run --config vitest.integration.config.ts tests/integration/soft-delete.test.ts
```

Both exit 0 with the new tests visible.

### Step 6 — full gate

`pnpm verify` (the lefthook pre-commit + pre-push harness — see
`AGENTS.md` and `claude-progress.md` session "P4-2 wire-up finish" for
the verified green baseline). All four stages green:

- typecheck-all
- unit-tests
- integration-tests (244+ tests including the 2 new ones)
- build

## Test plan

- `tests/integration/auth-2fa.test.ts` — add 1 test covering the
  soft-deleted-email register 409 path (SEC-02).
- `tests/integration/soft-delete.test.ts` — add 1 test covering the
  deleted-Workspace assertMembership 404 path (BUG-04).
- No new unit tests needed (the existing `totp.test.ts` and friends
  don't cover the touched paths).
- Existing integration test `tests/integration/soft-delete.test.ts` (24
  tests as of this audit) must stay green — BUG-04 changes the
  semantics of `assertMembership` for one edge case only.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm --filter @flow-desk/api typecheck` exits 0
- [ ] `pnpm --filter @flow-desk/api exec vitest run --config vitest.config.ts` exits 0
- [ ] `TEST_DB_PORT=5433 pnpm --filter @flow-desk/api exec vitest run --config vitest.integration.config.ts` exits 0; integration count ≥ 245
- [ ] `grep -n "CORS_ORIGINS\[0\]" apps/api/src/modules/auth/auth.routes.ts` returns 0 matches
- [ ] `grep -n "secure: env.NODE_ENV" apps/api/src/modules/auth/auth.routes.ts` returns ≥ 4 matches (existing auth cookies + the 3 new OAuth state cookies)
- [ ] `grep -n "deletedAt: null" apps/api/src/shared/lib/access.ts` returns ≥ 1 match
- [ ] `git status` shows only the in-scope files modified
- [ ] `plans/README.md` row for plan 023 updated to `DONE`

## STOP conditions

Stop and report back (do not improvise) if:

- The cookie helper at `auth.routes.ts:312` has changed shape (additional
  flags, different signature) since the excerpt.
- `env.CORS_ORIGINS` is not a string array — confirm
  `apps/api/src/shared/lib/env.ts` exposes it as a string (not
  pre-parsed) before depending on `split(',')`.
- `assertMembership` callers pass `workspaceId` from a route param
  (`c.req.param('workspaceId')`); if a caller passes a falsy value the new
  `findUnique({ id: undefined })` would 500 — verify the test sweep covers
  existing flows.
- The full `pnpm verify` integration step is the pre-existing known
  issue documented in `claude-progress.md` (P4-2 session) — set
  `TEST_DB_PORT=5433` in your shell for that step.

## Maintenance notes

- The OAuth state cookie fix (SEC-07) should be applied to the P4-3
  integrations state cookies in a follow-up plan (out of scope here).
- The full SEC-03 fix (partial unique indexes on `User.email`,
  `Workspace.slug`, `ApiKey.hashedKey`, `Integration @@unique`) is
  intentionally deferred — it is a multi-table migration with concurrent
  index creation. The register-handler fix in Step 4 is the smallest
  change that closes the user-visible leak.
- `assertMembership` is on the hot path (every authenticated route).
  Adding one `findUnique` on `Workspace` is a small but real cost.
  If profiling later shows it's a bottleneck, switch to
  `prisma.workspaceMember.findUnique({ ..., include: { workspace: { select: { deletedAt: true } } } })`.
- The `CORS_ORIGINS[0]` redirect was a 1.0-era shortcut. If a future
  feature needs to send different users to different post-login URLs
  (e.g. a marketing landing), prefer an `OAUTH_REDIRECT_FRONTEND` env
  dedicated to the OAuth flow rather than re-using `CORS_ORIGINS`.
