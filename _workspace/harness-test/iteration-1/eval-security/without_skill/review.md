# Security Review (baseline, without skill) — Chat multi-tenant authz

**Scope:** `apps/api/src/modules/chat/` (all module files)  
**Focus:** workspace membership, IDOR, typing  
**Related surfaces consulted (not modified):** Socket.IO collab handlers in `apps/api/src/shared/lib/socket.ts` and schemas in `apps/api/src/modules/realtime/schemas.ts` (typing / `conversation:join` / `message:send|read` call into chat services); task route that calls `getOrCreateTaskChannel`.  
**Method:** Static review of routes → service → repository; auth helpers; socket room join vs typing emit path. Product source not modified.  
**Date:** 2026-07-18  
**Reviewer mode:** General security knowledge only (no FlowDesk security skill).

---

## Executive summary

Cross-workspace isolation for REST channel/message APIs is in good shape: every mutating/read path under `/api/workspaces/:wid/channels…` requires auth, and channel access goes through `findAndValidateChannel`, which binds `channelId` to path `workspaceId` and requires a `workspaceMember` row. Mentions are filtered to workspace members. Message edit/delete is author-scoped with channel binding.

The main residual risks are **broken/incomplete private-channel authorization** (`isPrivate` is stored and exposed but never enforced), **channel admin operations lacking role checks** (any member can rename/delete any channel), **task-channel integrity** (REST create can attach an arbitrary `taskId`; `getOrCreateTaskChannel` has no user/membership parameter), and **socket typing / conversation rooms** that re-check membership only at join time (revocation lag; no private ACL).

---

## Trust model (as implemented)

| Control                  | Where                                                       | Behavior                                                                                               |
| ------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Authentication           | `chat.routes.ts` / `chat.message.routes.ts` `requireAuth()` | JWT via cookie/Bearer; no unauthenticated REST chat                                                    |
| Workspace membership     | `assertMembership` (`list`/`create` channel)                | Member row + workspace not soft-deleted; **400** if not member                                         |
| Channel + membership     | `findAndValidateChannel`                                    | Channel exists, not deleted, `channel.workspaceId === path workspaceId`, member row; **404** / **403** |
| Author ownership         | `updateMessage` / `deleteMessage`                           | `authorId === userId` or error                                                                         |
| Mentions                 | `sendMessage`                                               | `mentionedUserIds` intersected with `workspaceMember` for channel’s workspace                          |
| Socket conversation room | `conversation:join` in `socket.ts`                          | Load channel → require workspace member → `socket.join(conversation:id)`                               |
| Typing                   | `typing:start` / `typing:stop`                              | Only if `chatPresenceChannels` has channel (set only after successful join)                            |

---

## Findings

### F1 — `isPrivate` is not enforced (broken private-channel ACL)

**Severity:** High  
**Category:** Authorization / IDOR within tenant  
**Locations:**

- `chat.repository.ts` — `findAndValidateChannel` (membership only; ignores `isPrivate`)
- `chat.service.ts` — `listChannels` returns all workspace channels including `isPrivate: true`
- `chat.message.service.ts` — all message ops use `findAndValidateChannel` only
- Schema: `ChatChannel.isPrivate` exists; **no** channel-membership / allowlist table

**Issue:** Clients can create/update channels with `isPrivate: true`. Any other workspace member can still list the channel, open it, read/send messages, and join the Socket.IO room. Privacy is cosmetic.

**Impact:** Users who treat “private” as restricted membership get a false security guarantee; sensitive discussion in a “private” channel is visible to all workspace members (including GUEST if present).

**Recommendation:**

1. If private channels are in-scope product: introduce membership (e.g. `ChatChannelMember`) and enforce in `findAndValidateChannel`, `listChannels` filter, and `conversation:join`.
2. If not in-scope: stop accepting/advertising `isPrivate` as access control (or document as UI-only and default false without upgrade path that implies secrecy).

---

### F2 — Channel create/update/delete lacks role checks

**Severity:** Medium–High  
**Category:** Privilege escalation / horizontal privilege within workspace  
**Locations:**

- `chat.service.ts` — `createChannel`, `updateChannel`, `deleteChannel`
- Routes: any authenticated user who passes membership

**Issue:** There is no `assertRole` (OWNER/ADMIN). Any `MEMBER` or `GUEST` can:

- Create arbitrary channels
- Rename / flip `isPrivate` / change description on **any** channel
- Soft-delete **any** channel (including shared “general” or task-linked channels)

**Impact:** Destructive multi-tenant workspace sabotage; data availability loss for the whole workspace; low-privilege users can disrupt chat infrastructure.

**Recommendation:** Restrict update/delete (and possibly create) to OWNER/ADMIN or channel creator + admin override. Align with other modules that already use `assertRole`.

---

### F3 — REST task channel create does not bind `taskId` to workspace

**Severity:** Medium  
**Category:** Integrity / cross-resource binding  
**Location:** `chat.service.ts` `createChannel` when `scope: 'TASK'` + `body.taskId`

**Issue:** Membership is checked for path `workspaceId`, but `taskId` is persisted without verifying the task exists or belongs to that workspace. An attacker can create a TASK-scoped channel in WS-A pointing at a task id from WS-B (or a nonexistent id).

**Impact:** Metadata integrity failure; possible confusion in future features that trust `taskId`↔`workspaceId`; cross-tenant identifier association in DB.

**Recommendation:** Before create, load task by id, require `task.workspaceId === workspaceId` and not soft-deleted; reject otherwise with 404/400.

---

### F4 — `getOrCreateTaskChannel` has no authz surface

**Severity:** Medium (defense-in-depth)  
**Category:** Missing authorization on service API  
**Location:** `chat.service.ts` `getOrCreateTaskChannel(prisma, workspaceId, taskId)` — no `userId`

**Issue:** Function creates or returns a channel for any `(workspaceId, taskId)` with zero membership check. Current HTTP caller (`task.routes.ts` `POST /:id/task-channel`) first loads the task via `taskService.get(auth.user.id, id)` (membership implied), so the **route** is likely safe today. Any future caller that skips that step is an IDOR/create footgun.

**Recommendation:** Add `userId` and `assertMembership(workspaceId, userId)` (and task ownership/workspace bind) inside the service so authz cannot be skipped.

---

### F5 — Soft-deleted workspace gap on channel-scoped paths

**Severity:** Low–Medium  
**Category:** Inconsistent membership / lifecycle  
**Locations:**

- `assertMembership` — rejects soft-deleted workspace
- `findAndValidateChannel` — only checks `workspaceMember` row, **not** workspace `deletedAt`

**Issue:** List/create channel use `assertMembership` (workspace must be live). Get channel / messages / edit / delete / markRead use `findAndValidateChannel`, which still allows access if the membership row remains after workspace soft-delete.

**Impact:** Continued read/write of chat data after workspace is marked deleted (depending on how soft-delete is applied to members).

**Recommendation:** Share one helper that always checks membership **and** workspace not deleted; use it in `findAndValidateChannel`.

---

### F6 — Typing / conversation room: membership only at join; no private ACL; revocation lag

**Severity:** Medium (typing focus)  
**Category:** Realtime authorization  
**Locations:** `apps/api/src/shared/lib/socket.ts` (`conversation:join`, `typing:start|stop`); presence set `chatPresenceChannels`

**What works well:**

- Typing does **not** trust client channelId alone: emit is gated on `chatPresenceChannels.has(channelId)`, populated only after a successful join that checks workspace membership against the channel’s real `workspaceId`.
- Join does not accept a client-supplied workspaceId for the room (avoids classic “join foreign room by id” with wrong wid).
- Non-members silently fail join (no room subscription).

**Gaps:**

1. **No re-check on typing events** — after join, membership is not revalidated. A removed member keeps the socket room until disconnect and can continue typing indicators (and receive `message:new` / presence for that conversation).
2. **`isPrivate` not checked on join** — same as F1 for realtime.
3. **`typing:*` schemas only take `channelId`** — OK if join is authoritative; document that join is mandatory for any conversation-scoped realtime.
4. **In-memory `chatPresenceChannels` vs actual Socket.IO rooms** — leave clears both; disconnect clears both. No obvious room-join bypass via typing alone. Residual risk is stale membership after join (item 1).

**Recommendation:** On sensitive events (`typing:start`, `message:send` already re-checks via `sendMessage`/`findAndValidateChannel` — good), optionally re-validate membership periodically or on each typing start with rate limit; kick socket from `conversation:*` rooms when membership is revoked (member-remove hook).

---

### F7 — `message:read` / `markRead` double-broadcast and weak message binding

**Severity:** Low  
**Category:** Authz edge / information leakage  
**Locations:**

- `chat.message.service.ts` `markRead`
- `socket.ts` `message:read` handler (calls `markRead` then emits again)

**Issues:**

1. `markRead` correctly calls `findAndValidateChannel` (membership + channel/workspace bind).
2. If `messageId` is invalid, create may fail (FK) but code still broadcasts a read receipt “anyway” — can spam the room with fake read events for arbitrary message ids (integrity of “read by N”, not full data exfil).
3. Socket handler emits `message:read` **after** `markRead`, which already `emitToRoom`s the same event → duplicate events (correctness/noise).
4. Client-supplied `workspaceId` in socket payload is checked only indirectly via channel validation (mismatch → not found). Good for IDOR prevention.

**Recommendation:** Verify message belongs to `channelId` before broadcast; do not emit on FK failure; emit from one place only.

---

### F8 — Cross-workspace IDOR (classic) — largely mitigated

**Severity:** Informational (positive) / residual Low  
**Category:** IDOR

**Positive controls:**

- Path `wid` is the workspace authority; channel must match `channel.workspaceId`.
- Wrong workspace id for a known channel id → `NotFoundError` (does not confirm existence in another tenant via 403 on the wrong wid… actually non-member on correct foreign wid → 403; wrong wid → 404). Enumeration nuance is acceptable.
- Message ops require `existing.channelId === channelId`.
- Mentions stripped to current workspace members (integration-covered intent).
- Socket `message:send` loads channel workspace from DB, then `sendMessage` re-validates membership.

**Residual:**

- Non-member errors: `assertMembership` → **400** BadRequest vs `findAndValidateChannel` → **403** Forbidden — inconsistent and 400 is the wrong class for authz.
- Edit/delete others’ messages → **400** BadRequest (`Cannot edit others messages`) instead of **403** Forbidden — minor.

---

### F9 — Author email exposed on message payloads

**Severity:** Low  
**Category:** Information disclosure (within authorized room)  
**Locations:** `chat.message.routes.ts` broadcast; `chat.message.service.ts` update emit; socket `message:send` broadcast; message includes `author.email`

**Issue:** Any member in the conversation room receives co-workers’ emails on every message event. Often acceptable inside a workspace; still broader than name/avatar if emails are sensitive.

**Recommendation:** Prefer `id` + `name` + `avatarUrl` on realtime/public message DTOs unless product requires email.

---

### F10 — Idempotent `clientMessageId` is global per author

**Severity:** Low  
**Category:** Cache/dedupe side effect  
**Location:** `findByAuthorAndClientMessageId` — unique on `(authorId, clientMessageId)` globally

**Issue:** Dedupe lookup is not scoped to channel/workspace. A retry with a reused client id can return a prior message from another channel/workspace the user already authored (content they already had). Not a classic cross-user IDOR; weak isolation of idempotency keys.

**Recommendation:** Scope unique key to `(authorId, channelId, clientMessageId)` or include workspace in the client key contract.

---

## Cross-workspace IDOR attack matrix (REST)

| Attack                                      | Expected result                          | Code path                |
| ------------------------------------------- | ---------------------------------------- | ------------------------ |
| User A lists channels on WS-B               | Denied (`assertMembership`)              | `listChannels`           |
| User A gets channel of WS-B with path wid=B | 403 if known wid, membership fail        | `findAndValidateChannel` |
| User A gets channel of WS-B with path wid=A | 404 (`workspaceId` mismatch)             | `findAndValidateChannel` |
| User A lists/sends messages on B’s channel  | 403 / fail membership                    | message service          |
| User A edits B’s message in shared channel  | 400 author check                         | `updateMessage`          |
| User A deletes B’s channel                  | **Allowed if A is member of B** — see F2 | `deleteChannel`          |
| User A opens “private” channel in same WS   | **Allowed** — see F1                     | all paths                |
| Outsider in `mentionedUserIds`              | Filtered out                             | `sendMessage`            |

---

## Typing-specific conclusions

1. Typing is **not** an open IDOR to arbitrary `channelId` without join — good design.
2. Join enforces **workspace** membership, not channel-private membership — same gap as REST (F1).
3. Typing does not re-authz after membership revoke — F6.
4. Message send over socket re-enters service-layer membership checks — stronger than typing for data mutation.

---

## Strengths worth keeping

- Central `findAndValidateChannel` used consistently by message list/send/update/delete/markRead.
- Channel id always re-bound to path workspace id (prevents “know id, swap wid” data access).
- Soft-deleted channels treated as not found.
- Mentions cannot notify non-members (notification spam / cross-tenant notify).
- Socket auth middleware on `/collab`; conversation join membership check; typing gated on join set.
- `message:send` resolves workspace from DB channel row rather than trusting client workspace id.

---

## Suggested priority order

1. **F1** — Define and enforce private channel ACL or remove the promise of privacy.
2. **F2** — Role-gate channel update/delete (and possibly create).
3. **F3 / F4** — Bind task channels to real tasks + put authz inside `getOrCreateTaskChannel`.
4. **F6** — Membership revocation vs open conversation rooms / typing.
5. **F5 / F7 / F8 residual / F9 / F10** — Hardening and consistency.

---

## Files reviewed

| File                                                                                                            | Role                               |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `apps/api/src/modules/chat/chat.routes.ts`                                                                      | REST channels + `requireAuth`      |
| `apps/api/src/modules/chat/chat.service.ts`                                                                     | Channel business logic, emit       |
| `apps/api/src/modules/chat/chat.repository.ts`                                                                  | `findAndValidateChannel`, queries  |
| `apps/api/src/modules/chat/chat.message.routes.ts`                                                              | REST messages + broadcast          |
| `apps/api/src/modules/chat/chat.message.service.ts`                                                             | Messages, mentions, markRead       |
| `apps/api/src/modules/chat/chat.message.repository.ts`                                                          | Message persistence                |
| `apps/api/src/modules/chat/chat.test.ts`                                                                        | Unit coverage (not authz matrix)   |
| `apps/api/src/modules/chat/chat.message.test.ts`                                                                | Unit coverage (author edit denial) |
| Related: `shared/lib/access.ts`, `shared/lib/socket.ts`, `modules/realtime/schemas.ts`, task route task-channel |

---

## Finding count

| Severity                    | Count                          |
| --------------------------- | ------------------------------ |
| High                        | 1 (F1); F2 treated Medium–High |
| Medium                      | 4 (F2, F3, F4, F6)             |
| Low / Low–Medium            | 4 (F5, F7, F9, F10)            |
| Informational               | 1 (F8 positive + residual)     |
| **Total discrete findings** | **10** (F1–F10)                |

**Actionable security findings (High+Medium, counting F2 as medium-high):** **6**  
**Including lows:** **10**
