# FlowDesk security review — chat module multi-tenant authz

Scope: `apps/api/src/modules/chat/*` (REST load/send/edit/delete), plus socket collab paths that gate typing/join/send for chat. Focus: workspace membership, IDOR, typing gates.

## Findings

apps/api/src/modules/chat/chat.repository.ts:41: medium: `isPrivate` is never enforced after membership; any workspace member can list/get/send on channels with `isPrivate: true`. When product private-channel ACL ships, filter list and gate `findAndValidateChannel` by channel membership (not only workspace membership).

apps/api/src/modules/chat/chat.message.service.ts:236: low: `markRead` calls `findAndValidateChannel` then creates `ChatMessageRead` for `upToMessageId` without asserting `message.channelId === channelId`. Enforce message belongs to channel before insert/broadcast (integrity; not cross-tenant if channel access is already gated).

apps/api/src/modules/chat/chat.service.ts:178: low: `getOrCreateTaskChannel(prisma, workspaceId, taskId)` takes no `userId` and skips membership. Safe today because `task.routes` loads the task via `taskService.get` first; assert membership (or pass userId) inside the helper so a future caller cannot create task channels without authz.

apps/api/src/modules/chat/chat.service.ts:116: low: `updateChannel` / `deleteChannel` allow any workspace member (including GUEST) after membership check only. Restrict channel admin ops to OWNER/ADMIN via `assertRole` if guests must not rename/delete channels.

apps/api/src/shared/lib/socket.ts:284: low: `typing:start` / `typing:stop` gate on join-time `chatPresenceChannels` only; a user removed from the workspace can still emit typing until disconnect. Residual; re-check membership on typing or force-leave rooms on membership revoke if threat model requires.

## Verdict: PASS

## Blocking

- None. Cross-tenant chat IDOR (historical AUD/plan 029) is closed on load and send paths.

## Residual (non-blocking)

- **Private channel ACL** — `isPrivate` is a flag only; tenant isolation is workspace membership, not per-channel ACL (explicitly out of scope in plan 029; also noted in REALTIME-AUDIT C10).
- **markRead message↔channel binding** — integrity within authorized channel access.
- **getOrCreateTaskChannel defense-in-depth** — authz only at HTTP caller.
- **Channel admin role** — no OWNER/ADMIN gate on update/delete.
- **Typing after membership revoke** — join-time membership only until disconnect.

## Evidence (positive controls)

| Path                                                                            | Control                                                                                                      |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| REST routes (`chat.routes.ts`, `chat.message.routes.ts`)                        | `requireAuth()` on `*`; `wid` / `channelId` from params                                                      |
| `listChannels` / `createChannel`                                                | `assertMembership(workspaceId, userId)` before repo                                                          |
| `getChannel` / `updateChannel` / `deleteChannel`                                | `findAndValidateChannel` (channel + workspace match + soft-delete + membership → 404/403)                    |
| `listMessages` / `sendMessage` / `updateMessage` / `deleteMessage` / `markRead` | `findAndValidateChannel` first                                                                               |
| Mentions (`sendMessage`)                                                        | `mentionedUserIds` filtered to `workspaceMember` rows; outsiders dropped                                     |
| Socket `conversation:join`                                                      | Load channel → `workspaceMember` for `channel.workspaceId` → join only if member                             |
| Socket `typing:start` / `typing:stop`                                           | No emit unless `chatPresenceChannels.has(channelId)` (set only after successful join)                        |
| Socket `message:send`                                                           | Resolves `workspaceId` from DB channel row (not client); `sendMessage` re-validates membership               |
| Integration                                                                     | `idor-cross-workspace.test.ts`: non-member list/send on foreign non-private channel → 403; mentions filtered |

Exploit path re-check: workspace A channel id + user B session (no membership) → expect 403/404 on list/get/send/join/typing. Current code matches.
