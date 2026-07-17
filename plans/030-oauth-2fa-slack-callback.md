# Plan 030: Google OAuth respects 2FA; fix Slack/GitLab callback; verify Slack signatures

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 081cbc6..HEAD -- apps/api/src/modules/auth/auth.routes.ts apps/api/src/modules/integrations/integrations.routes.ts apps/api/tests/integration/integrations.test.ts apps/api/tests/integration/auth-2fa.test.ts packages/shared/src`
> On mismatch with Current state excerpts → STOP.

## Status

- **Priority**: P1
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: none (can land in parallel with 029)
- **Category**: security
- **Planned at**: commit `081cbc6`, 2026-07-15

## Why this matters

(1) Password login challenges 2FA, but Google OAuth sets session cookies without checking `twoFactorEnabled` — full 2FA bypass. (2) Integration OAuth callbacks require query `workspaceId`, which Slack/GitLab never echo — connect is broken in production. (3) Slack slash-command route processes the body when `SLACK_SIGNING_SECRET` is set but never verifies the signature.

## Current state

### Google OAuth skips 2FA

Password path (`auth.routes.ts` ~177–180):

```ts
if (user.twoFactorEnabled) {
  const challengeToken = signTwoFactorChallenge({ userId: user.id, email: user.email });
  return c.json({ twoFactorRequired: true as const, challengeToken });
}
```

Google callback (~504–516) always:

```ts
setAuthCookies(c, access, refresh);
return postLoginRedirect(c);
```

2FA challenge helpers: `signTwoFactorChallenge` / `verifyTwoFactorChallenge` in auth module (used by `/login/2fa`). Frontend 2FA page: `apps/web/src/features/auth/pages/…` (existing password flow).

### Integration callback schema

`integrations.routes.ts`:

```ts
const oauthCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  workspaceId: z.string().min(1), // providers do not send this
});
```

Connect stores `oauth_workspace` cookie. Callback already compares `cookieWorkspace !== workspaceId` — should use cookie as sole source of workspaceId.

Tests at `apps/api/tests/integration/integrations.test.ts` append `&workspaceId=` to callback URLs — update to cookie-only.

### Slack slash command stub

```ts
// integrations.routes.ts ~229–239
integrationsRouter.post('/slack/commands', async (c) => {
  if (!env.SLACK_SIGNING_SECRET) {
    return c.json({ code: 'NOT_CONFIGURED', … }, 501);
  }
  // Signature verification would go here when SLACK_SIGNING_SECRET is set.
  const body = await c.req.parseBody();
  …
});
```

Slack signing protocol: base string `v0:${timestamp}:${rawBody}`; HMAC-SHA256 with signing secret; header `X-Slack-Signature: v0=<hex>`; reject if `|now - timestamp| > 5 minutes`.

## Commands you will need

| Purpose     | Command                                         | Expected on success |
| ----------- | ----------------------------------------------- | ------------------- |
| Typecheck   | `pnpm --filter @flow-desk/api typecheck`        | exit 0              |
| Unit        | `pnpm --filter @flow-desk/api test:unit`        | pass                |
| Integration | `pnpm --filter @flow-desk/api test:integration` | pass                |
| Full gate   | `pnpm verify`                                   | exit 0              |

## Scope

**In scope**:

- `apps/api/src/modules/auth/auth.routes.ts` (Google callback 2FA branch)
- Optionally a small helper under `apps/api/src/modules/auth/` if needed for redirect challenge page
- `apps/api/src/modules/integrations/integrations.routes.ts`
- New helper file e.g. `apps/api/src/modules/integrations/slack-sign.ts` (+ unit test) for signature verify
- `apps/api/tests/integration/integrations.test.ts`
- `apps/api/tests/integration/auth-2fa.test.ts` (extend) or new test file
- Minimal web change **only if required** so Google+2FA users can complete challenge (e.g. redirect to `/login?oauth2fa=1` with challenge in query or short-lived cookie). Prefer cookie/session challenge token + existing `/login` 2FA UI if possible.

**Out of scope**:

- Implementing real slash-command task actions (DIR item) — only signature gate + safe echo or 200 “ok” after verify
- Plan 029 chat IDOR
- Changing TOTP crypto storage

## Git workflow

- Commit example: `fix(auth): google oauth 2fa; fix integration callback; slack signature`
- Do not push unless asked.

## Steps

### Step 1: Google callback requires 2FA when enabled

After the user row is resolved in `GET /google/callback` (before `setAuthCookies`):

1. If `user.twoFactorEnabled`:
   - Create `challengeToken` via `signTwoFactorChallenge({ userId, email })`.
   - **Do not** set access/refresh cookies.
   - Redirect to a URL the SPA already handles for 2FA completion, e.g. `${frontendOrigin}/login?twoFactor=1` and set a short-lived **httpOnly** cookie `oauth_2fa_challenge` with the token, **or** return redirect with fragment only if FE already supports challengeToken from password login — read `apps/web/src/features/auth` and match the existing password 2FA UX.
2. If 2FA is off, keep current session issuance.

If the SPA login page only accepts challengeToken from JSON password response, the smallest fix is:

- Set `httpOnly` cookie `two_factor_challenge` with the token
- Redirect to `/login`
- FE on mount: if cookie/query indicates 2FA pending, show TOTP form and POST `/api/auth/login/2fa` with challengeToken read from a new endpoint or a non-httpOnly delivery path.

**Preferred product-safe approach** (pick one and implement fully):

**A (recommended, minimal FE):** After Google, if 2FA on, redirect to  
`/login?challengeRequired=1` and put `challengeToken` in a **short-lived non-httpOnly cookie** `fd_2fa_challenge` (maxAge 300, SameSite=Lax, Secure in prod) that the login page already could read — OR pass via query string **only if** token is single-use JWT with short TTL (existing challenge JWT is fine; query is acceptable for same-device OAuth redirect). Many codebases use:  
`return c.redirect(\`${origin}/login?twoFactorChallenge=${encodeURIComponent(challengeToken)}\`)`  
and FE login page already has 2FA step when challenge is present.

Read `apps/web/src/features/auth/pages/login.tsx` (or equivalent). Wire the minimal path so POST `/api/auth/login/2fa` still works unchanged.

**Verify**: Integration test: user with `twoFactorEnabled: true` completing Google callback does **not** receive `access_token` Set-Cookie; response is redirect including challenge path. User without 2FA still gets cookies.

### Step 2: Integration callback uses cookie workspaceId only

1. Change schema to:

```ts
const oauthCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});
```

2. After state/provider checks, set:

```ts
const workspaceId = cookieWorkspace;
if (!cookieUser || !workspaceId) {
  return c.json({ code: 'MISSING_SESSION', message: 'OAuth session cookies missing' }, 400);
}
```

3. Remove requirement that query contains workspaceId.
4. Update `integrations.test.ts` callback URLs to drop `&workspaceId=…` (cookie from connect response still required).

**Verify**:

```bash
pnpm --filter @flow-desk/api test:integration -- integrations
```

→ pass without query workspaceId.

### Step 3: Slack request signature verification

Add `apps/api/src/modules/integrations/slack-sign.ts`:

```ts
export function verifySlackSignature(opts: {
  signingSecret: string;
  signatureHeader: string | undefined; // X-Slack-Signature
  timestampHeader: string | undefined; // X-Slack-Request-Timestamp
  rawBody: string;
  nowSec?: number;
}): boolean;
```

Rules:

- Missing headers → false
- Timestamp skew > 300s → false
- Compute HMAC-SHA256 hex of `v0:${timestamp}:${rawBody}` with secret; constant-time compare to signature after stripping `v0=` prefix (support `v0=` format per Slack docs).

In `POST /slack/commands`:

1. Read **raw body** as text **before** parseBody (critical for HMAC). Hono: `const rawBody = await c.req.text()` then parse form from that string if needed (`URLSearchParams`).
2. If `!verifySlackSignature(...)` → `401` JSON `{ code: 'INVALID_SIGNATURE' }`.
3. On success, keep ephemeral echo **or** return `{ ok: true }` — do not expand command features (out of scope).

Unit test `slack-sign.test.ts` with known secret/body/signature vectors (construct HMAC in test).

**Verify**:

```bash
pnpm --filter @flow-desk/api test:unit -- slack-sign
```

→ pass; invalid signature path returns 401 in a small route/integration test if feasible.

### Step 4: Regression suite

- Update any 2FA integration tests that assumed Google always sets cookies.
- Ensure `auth-2fa` password flow still green.

**Verify**:

```bash
pnpm --filter @flow-desk/api test:integration
pnpm --filter @flow-desk/web typecheck   # if FE touched
```

## Test plan

| Case                                            | Expected                                                               |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| Google callback, 2FA off                        | Session cookies set                                                    |
| Google callback, 2FA on                         | No access cookie; challenge delivered; `/login/2fa` can finish session |
| Slack/GitLab callback without query workspaceId | Uses cookie; success path works in test with mocked token exchange     |
| Slack command bad signature                     | 401                                                                    |
| Slack command good signature                    | 200 ephemeral/ok                                                       |
| Slack command missing secret                    | 501                                                                    |

Pattern: `auth-2fa.test.ts`, `integrations.test.ts`.

## Done criteria

- [ ] 2FA-enabled users cannot obtain session via Google alone
- [ ] Integration OAuth callback works with only `code` + `state` query params
- [ ] Slack slash route verifies signature when secret configured
- [ ] Unit + integration green; web typecheck if FE changed
- [ ] `plans/README.md` 030 → DONE

## STOP conditions

- FE 2FA completion after OAuth requires a full new settings redesign → stop and report minimal redirect design options; do not invent a second TOTP stack.
- Slack raw body unavailable due to prior middleware consuming stream → stop and report.
- Google callback structure drifted heavily from excerpt → re-read and re-plan.

## Maintenance notes

- Reviewers: ensure challenge tokens remain short-TTL JWT; never log them.
- Real slash-command actions remain a product DIR follow-up after this security gate.
- Self-hosted: document that Slack needs signing secret for commands endpoint.
