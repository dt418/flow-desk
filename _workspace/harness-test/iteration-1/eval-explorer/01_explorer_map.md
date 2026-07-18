## Target

Where is workspace membership checked for **chat** (channels + messages + realtime)?

Package map: `apps/api` (primary) · shared Zod `@flow-desk/shared/chat` · web `apps/web/src/features/chat` (client only; no membership enforcement).

## Key files (path:line)

| Layer                                            | Path:line                                                                   | What it does                                                                                                                                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared helper                                    | `apps/api/src/shared/lib/access.ts:4-17`                                    | `assertMembership(workspaceId, userId)` — `workspaceMember` lookup + soft-deleted workspace → NotFound                                                                                  |
| Channel list/create                              | `apps/api/src/modules/chat/chat.service.ts:10`                              | `listChannels` → `assertMembership`                                                                                                                                                     |
| Channel create                                   | `apps/api/src/modules/chat/chat.service.ts:73`                              | `createChannel` → `assertMembership`                                                                                                                                                    |
| Channel get/update/delete                        | `apps/api/src/modules/chat/chat.service.ts:40,123,170`                      | Delegates to `repo.findAndValidateChannel`                                                                                                                                              |
| Core gate (channel-scoped ops)                   | `apps/api/src/modules/chat/chat.repository.ts:31-48`                        | `findAndValidateChannel` — channel exists + `workspaceId` match + **always** `workspaceMember` (public channels still tenant-scoped); throws `ForbiddenError('Not a workspace member')` |
| Messages (list/send/edit/delete/read)            | `apps/api/src/modules/chat/chat.message.service.ts:23,52,160,207,236`       | All call `channelRepo.findAndValidateChannel` before work                                                                                                                               |
| Mention filter                                   | `apps/api/src/modules/chat/chat.message.service.ts:57-65`                   | Mentions filtered to `workspaceMember` rows for channel's workspace only                                                                                                                |
| HTTP auth (not membership)                       | `apps/api/src/modules/chat/chat.routes.ts:14` · `chat.message.routes.ts:15` | `requireAuth()` only — membership is service/repo, not route middleware                                                                                                                 |
| Router mount                                     | `apps/api/src/app.ts:107-108`                                               | `/api/workspaces/:wid/channels` · `.../messages`                                                                                                                                        |
| Socket: conversation join                        | `apps/api/src/shared/lib/socket.ts:245-264`                                 | Load channel → `workspaceMember.findUnique` → join `conversation:{channelId}` only if member                                                                                            |
| Socket: typing                                   | `apps/api/src/shared/lib/socket.ts:283-298`                                 | Relies on join-time membership (`chatPresenceChannels`)                                                                                                                                 |
| Socket: workspace room                           | `apps/api/src/shared/lib/socket.ts:168+`                                    | Separate workspace join also checks `workspaceMember`                                                                                                                                   |
| Task channel helper                              | `apps/api/src/modules/chat/chat.service.ts:178-204`                         | `getOrCreateTaskChannel` — **no direct membership check**; caller is `task.routes.ts:163` after `taskService.get` (which enforces task access)                                          |
| Cached role middleware (not used by chat routes) | `apps/api/src/shared/middleware/auth.ts:50+` · `auth-cache.ts:28+`          | `requireWorkspaceRole` / `getCachedMembership` — available app-wide; chat uses assert/findAndValidate instead                                                                           |

**Call flow (REST, channel/message):**

```
requireAuth (JWT)
  → chat*.routes (Zod)
    → chat.service / chat.message.service
      → assertMembership  OR  chat.repository.findAndValidateChannel
        → prisma.workspaceMember.findUnique({ workspaceId_userId })
```

**Call flow (Socket.IO `/collab` conversation):**

```
socket JWT auth on connect
  → conversation:join
    → chatChannel by id
    → workspaceMember for channel.workspaceId + userId
    → socket.join(`conversation:{id}`) if member
```

## Related tests

| File                                                          | Relevance                                           |
| ------------------------------------------------------------- | --------------------------------------------------- |
| `apps/api/src/modules/chat/chat.test.ts`                      | Unit; mocks `assertMembership`                      |
| `apps/api/src/modules/chat/chat.message.test.ts`              | Unit; mocks `assertMembership` / channel validation |
| `apps/api/tests/integration/chat.service.test.ts`             | Integration membership/channel flows                |
| `apps/api/tests/integration/idor-cross-workspace.test.ts:116` | Chat mentions filtered to workspace members only    |
| `packages/shared/src/chat.test.ts`                            | Zod schemas only (no membership)                    |

## Risks / open questions

1. **Two membership APIs, two error codes:** `assertMembership` → `BadRequestError('Not a member…')`; `findAndValidateChannel` → `ForbiddenError('Not a workspace member')`. Inconsistent HTTP status for the same class of failure.
2. **Repo owns authz:** Membership gate lives in `chat.repository.ts` (`findAndValidateChannel`), not only in service — layout smell if implementers assume repos are Prisma-only.
3. **`getOrCreateTaskChannel` trusts caller:** Safe today via task service; unsafe if reused from an unguarded path.
4. **Socket silent deny:** Non-members on `conversation:join` get no error event (early return) — clients may think join succeeded.
5. **Soft-delete depth:** `assertMembership` rejects soft-deleted workspaces; `findAndValidateChannel` checks channel `deletedAt` + member row but does **not** re-check workspace `deletedAt` the same way as `assertMembership`.
6. **Private channels:** Comment says public channels are still tenant-scoped; no extra private-channel ACL beyond workspace membership was found in this map (verify product intent for `isPrivate`).
