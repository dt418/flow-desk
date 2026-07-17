# Plan 032: Block SSRF on outbound webhooks; validate automation action targets

> **Executor instructions**: Follow step by step. Verify each step. STOP conditions → report. Update `plans/README.md` when done.
>
> **Drift check**:
> `git diff --stat 081cbc6..HEAD -- apps/api/src/workers/webhook apps/api/src/modules/automation apps/api/src/modules/webhook packages/shared/src/webhook.ts packages/shared/src/automation.ts`
> Mismatch → STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (self-hosted private webhooks need override path)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `081cbc6`, 2026-07-15

## Why this matters

Workspace admins can set webhook/automation URLs that the server `fetch`es. There is no block on loopback, link-local, or private ranges — classic SSRF toward cloud metadata (`169.254.169.254`) or internal admin UIs. Automation `assign` / `move-column` also skip verifying the target lives in the task’s workspace.

## Current state

- URL validation only: `z.string().url()` in `packages/shared/src/webhook.ts` and `automation.ts`.
- Worker: `apps/api/src/workers/webhook/queue.ts` ~63 `fetch(webhookUrl, …)` stores `responseBody`.
- Automation: `apps/api/src/modules/automation/automation.service.ts` ~206–216 `send-webhook` `fetch(action.url, …)`; ~190–204 assign/move without membership/column checks.
- Activity enqueues webhooks via `apps/api/src/modules/activity/activity.service.ts`.

**Self-hosted note**: some operators want private-network webhooks. Default must be safe (deny private); optional env opt-in for advanced deploys is allowed.

## Commands you will need

| Purpose       | Command                                         | Expected |
| ------------- | ----------------------------------------------- | -------- |
| Typecheck API | `pnpm --filter @flow-desk/api typecheck`        | exit 0   |
| Unit          | `pnpm --filter @flow-desk/api test:unit`        | pass     |
| Integration   | `pnpm --filter @flow-desk/api test:integration` | pass     |
| Full          | `pnpm verify`                                   | exit 0   |

## Scope

**In scope**:

- New helper e.g. `apps/api/src/shared/lib/url-safety.ts` (+ unit tests)
- Optional env flag in `packages/env/src/backend.ts` e.g. `ALLOW_PRIVATE_WEBHOOK_URLS` default false
- `apps/api/src/modules/webhook/webhook.service.ts` (or routes) — reject unsafe URL on create/update
- `apps/api/src/workers/webhook/queue.ts` — re-check before fetch (defense in depth)
- `apps/api/src/modules/automation/automation.service.ts` — SSRF check + assign/column workspace checks
- Tests for url-safety, automation action validation, webhook create rejection

**Out of scope**:

- Full outbound proxy / allowlist UI product
- Changing webhook HMAC signing
- Plan 033 export work

## Git workflow

- Commit example: `fix(security): ssrf guards for webhooks and automation targets`
- Do not push unless asked.

## Steps

### Step 1: Implement `assertSafeOutboundUrl(url: string): void`

Create `apps/api/src/shared/lib/url-safety.ts`:

1. Parse with `new URL(url)`.
2. Allow only `http:` and `https:`.
3. Resolve hostname:
   - Reject obvious literals: `localhost`, `*.local`, empty host.
   - Use `dns.promises.lookup(hostname, { all: true })` (or `lookup` with `verbatim`) and check **every** returned address.
4. Reject IPs in:
   - Loopback (127.0.0.0/8, ::1)
   - Link-local (169.254.0.0/16, fe80::/10) — **includes cloud metadata**
   - Private RFC1918 (10/8, 172.16/12, 192.168/16)
   - Unique local IPv6 (fc00::/7)
   - `0.0.0.0`, multicast, etc.
5. If `env.ALLOW_PRIVATE_WEBHOOK_URLS === true` (or similar), skip private/RFC1918 checks but **still reject link-local metadata range 169.254.0.0/16** (never allow metadata).
6. On failure throw `BadRequestError` with a safe message (`'URL is not allowed for outbound webhooks'`).

Also export `isSafeOutboundUrl` boolean helper for the worker.

**Redirect note**: `fetch` may follow redirects to private IPs. Prefer `redirect: 'manual'` or `'error'` on outbound webhook/automation fetches so a public URL cannot bounce to metadata. Document in code comment.

**Verify**: unit tests cover:

- `https://example.com` → ok (mock dns to public IP)
- `http://127.0.0.1/` → reject
- `http://169.254.169.254/` → reject even if allow-private flag true
- `http://192.168.1.1/` → reject unless allow-private
- `file:///etc/passwd` → reject

### Step 2: Wire validation on create/update webhook

In webhook service create/update (find exact methods via `rg create webhook.service`), call `assertSafeOutboundUrl(body.url)` before persist.

**Verify**: integration test create webhook with `http://127.0.0.1/hook` → 400.

### Step 3: Worker re-check + redirect policy

In `queue.ts` before fetch:

```ts
if (!isSafeOutboundUrl(webhookUrl)) {
  await updateDelivery(..., { status: 'ERROR', error: 'URL not allowed' });
  return; // do not throw forever-retry if URL is permanently bad — or throw non-retryable
}
```

Use `redirect: 'manual'` (or equivalent) on `fetch`. Truncate stored `responseBody` if not already (e.g. max 4KB) to reduce data exfil usefulness.

### Step 4: Automation `send-webhook` + assign/move-column

In `executeAction` (or equivalent name in `automation.service.ts`):

1. `send-webhook`: `assertSafeOutboundUrl(action.url)` then fetch with redirect blocked.
2. `assign`: resolve assignee; if not `'workspace-owner'`, verify `workspaceMember` for `task.workspaceId` + `assigneeId`; else throw/skip with FAILED execution.
3. `move-column`: `prisma.column.findUnique` → must exist and `column.workspaceId === task.workspaceId`.

**Verify**: unit/integration tests for bad column and non-member assignee.

### Step 5: Env documentation

- Add `ALLOW_PRIVATE_WEBHOOK_URLS` to `packages/env` (boolean, default false).
- Document in `.env.example` one line: private LAN webhooks only when explicitly enabled; metadata still blocked.

**Verify**: `pnpm --filter @flow-desk/api typecheck`

## Test plan

- Unit: url-safety matrix (required).
- Integration: webhook create rejects localhost.
- Automation: optional unit on executeAction with mocked prisma.

Pattern: existing `webhook.test.ts`, `automation.test.ts`.

## Done criteria

- [ ] Outbound URL helper exists with unit tests
- [ ] Create/update webhook + worker + automation send-webhook all use it
- [ ] fetch does not follow redirects to arbitrary hosts (`redirect: 'manual'|'error'`)
- [ ] assign/move-column scoped to workspace
- [ ] 169.254 never allowed
- [ ] typecheck + unit + integration green
- [ ] `plans/README.md` 032 → DONE

## STOP conditions

- DNS resolution in tests is flaky → inject a `lookup` function dependency for tests.
- Existing production users rely on private webhooks without env → default remains deny; document migration.
- Worker cannot import shared env cleanly → stop and report pathing issue.

## Maintenance notes

- Reviewers: ensure no timing oracle in error messages; constant-time not required for URL deny.
- Follow-up: optional allowlist of domains in workspace settings.
- SSRF is the #1 review focus for this PR.
