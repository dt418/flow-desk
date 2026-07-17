# Plan 029: Always enforce workspace membership for chat + typing; Secure integration OAuth cookies

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 081cbc6..HEAD -- apps/api/src/modules/chat/chat.repository.ts apps/api/src/shared/lib/socket.ts apps/api/src/modules/integrations/integrations.routes.ts apps/api/src/modules/chat/chat.test.ts apps/api/src/modules/chat/chat.message.test.ts apps/api/tests/integration/idor-cross-workspace.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `081cbc6`, 2026-07-15

## Why this matters

Non-private chat channels skip workspace membership checks. Any authenticated user who knows `workspaceId` + `channelId` can list/send messages on another tenant’s public channels. Socket typing events have the same hole. Integration OAuth state cookies also omit `Secure` in production, unlike auth/Google cookies. Closing these three small gaps removes real cross-tenant chat IDOR and hardens OAuth state cookies with minimal blast radius.

## Current state

- `apps/api/src/modules/chat/chat.repository.ts` — `findAndValidateChannel` only checks membership when `isPrivate`:

```ts
// ~lines 41–48
if (channel.isPrivate) {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!member) {
    throw new ForbiddenError('You do not have access to this private channel');
  }
}
```

- `apps/api/src/modules/chat/chat.message.service.ts` — `listMessages` / send / update / delete call `findAndValidateChannel` and inherit the gap.
- `apps/api/src/shared/lib/socket.ts` — `conversation:join` checks membership; `typing:start` / `typing:stop` (~280–301) only emit with no membership check.
- `apps/api/src/modules/integrations/integrations.routes.ts` — OAuth cookies (~71–89, 114–132) use `httpOnly` + `sameSite: 'Lax'` but **no** `secure`.
- Auth cookies exemplar (`apps/api/src/modules/auth/auth.routes.ts:64-77`): `secure: env.NODE_ENV === 'production'`.
- ForbiddenError lives in `apps/api/src/shared/errors` — already imported by `chat.repository.ts`.
- Existing tests: `apps/api/src/modules/chat/chat.test.ts`, `chat.message.test.ts`, `apps/api/tests/integration/idor-cross-workspace.test.ts`.

**Repo conventions**: services throw typed errors (`ForbiddenError`, `NotFoundError`); routes use centralized error handler. Integration tests use real Postgres via vitest integration config. Commit style: conventional commits (`fix(security): …`).

## Commands you will need

| Purpose                   | Command                                         | Expected on success |
| ------------------------- | ----------------------------------------------- | ------------------- |
| Typecheck API             | `pnpm --filter @flow-desk/api typecheck`        | exit 0              |
| Unit tests                | `pnpm --filter @flow-desk/api test:unit`        | all pass            |
| Integration               | `pnpm --filter @flow-desk/api test:integration` | all pass            |
| Full gate (before commit) | `pnpm verify`                                   | exit 0              |

## Scope

**In scope**:

- `apps/api/src/modules/chat/chat.repository.ts`
- `apps/api/src/shared/lib/socket.ts`
- `apps/api/src/modules/integrations/integrations.routes.ts`
- `apps/api/src/modules/chat/chat.test.ts` and/or `chat.message.test.ts` (unit)
- `apps/api/tests/integration/idor-cross-workspace.test.ts` **or** a new `chat-idor.test.ts` if cleaner

**Out of scope**:

- Private-channel ACL beyond workspace membership (no per-channel ACL model exists)
- Plan 030 OAuth/Slack changes
- Frontend chat UI

## Git workflow

- Branch: `advisor/029-chat-idor-typing-cookies` (optional; work on current branch if operator says so)
- Commit message example: `fix(security): enforce chat membership + secure integration oauth cookies`
- Do NOT push/PR unless asked.

## Steps

### Step 1: Always require workspace membership in `findAndValidateChannel`

In `chat.repository.ts`, **always** load the workspace member (not only when `isPrivate`). If missing, throw `ForbiddenError` with a clear message (e.g. `'Not a workspace member'`). Keep the workspace/channel existence + soft-delete checks as today.

Optional: keep a slightly different message for private vs public is fine but not required — one membership gate is enough.

**Verify**: `rg -n "isPrivate" apps/api/src/modules/chat/chat.repository.ts` still may mention the field for other reasons, but membership check must not be nested under `if (channel.isPrivate)`.

### Step 2: Gate socket typing on join or membership

In `socket.ts` for `typing:start` and `typing:stop`:

- Prefer requiring the socket already joined the room: e.g. only emit if `chatPresenceChannels.has(data.channelId)` **or** `socket.rooms.has(\`conversation:${data.channelId}\`)`.
- If join set is not available on that code path, reuse the same prisma membership lookup as `conversation:join` and return silently (no emit) when not a member.

Do **not** emit typing for unknown/unauthorized channels.

**Verify**: `rg -n "typing:start" apps/api/src/shared/lib/socket.ts -A 15` shows a membership or room-membership guard before `.emit`.

### Step 3: Add `secure` to integration OAuth cookies

In `integrations.routes.ts`, for every `setCookie` of `oauth_state`, `oauth_workspace`, `oauth_user`, `oauth_provider` (Slack + GitLab connect):

```ts
secure: env.NODE_ENV === 'production',
```

`env` is already imported from `../../shared/lib/env`. Match auth cookie options (`httpOnly`, `sameSite: 'Lax'`, `path: '/'`, `maxAge: 600`).

**Verify**: `rg -n "setCookie\\(c, 'oauth_" apps/api/src/modules/integrations/integrations.routes.ts -A 6` shows `secure:` on each block.

### Step 4: Tests

1. **Unit or integration — chat IDOR**: User A in workspace A; create a **non-private** channel in workspace B (or another workspace where A is not a member). User A’s request to list/send messages on that channel must be **403** (not 200). Model structure after `idor-cross-workspace.test.ts`.
2. **Unit — typing** (optional if hard to unit-test socket): if existing gateway tests mock sockets (`realtime.gateway.test.ts` pattern), add a case that typing without join does not emit. If too heavy, document in test plan that chat IDOR integration is the gate for this plan and typing is covered by code review + manual note — **prefer** at least one unit test if mocks already exist for chat/socket.

**Verify**:

```bash
pnpm --filter @flow-desk/api test:unit
pnpm --filter @flow-desk/api test:integration
```

→ exit 0; new IDOR assertion fails if Step 1 is reverted.

## Test plan

- New case: non-member cannot list messages on non-private channel of foreign workspace.
- Regression: member **can** still list/send on public and private channels of their workspace.
- Pattern: `apps/api/tests/integration/idor-cross-workspace.test.ts` and `chat.service.test.ts`.

## Done criteria

- [ ] `findAndValidateChannel` always checks workspace membership
- [ ] Typing handlers do not emit without authorization
- [ ] All four integration OAuth cookie types set `secure` in production
- [ ] New IDOR test(s) pass; full API unit + integration green
- [ ] `pnpm --filter @flow-desk/api typecheck` exit 0
- [ ] No files outside scope modified
- [ ] `plans/README.md` row 029 → DONE

## STOP conditions

- `findAndValidateChannel` already always checks membership (re-verify and mark DONE without changes).
- Changing typing requires a large socket rewrite outside listed files.
- Integration tests cannot create multi-workspace fixtures (report; do not skip the IDOR case).

## Maintenance notes

- Future per-channel ACL should layer **on top of** workspace membership, not replace it.
- Reviewers: confirm public channels are no longer readable cross-tenant.
- Deferred: refresh-token reuse detection (separate finding).
