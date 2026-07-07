# Realtime Chat Audit — FlowDesk

Phase 0 audit of the realtime chat layer. Three parallel audits of server, client, and infrastructure produced **14 CRIT, 26 HIGH, 14 MED, and 30+ LOW** findings. Findings are grouped by file, ordered CRIT → HIGH → MED → LOW, with `file:line` references for navigation. This document is the source of truth for `ADR-007` and the four-phase plan in `docs/superpowers/plans/2026-07-07-realtime-chat-refactor.md`.

## Severity legend

- **CRIT** — data loss, security breach, or runtime crash.
- **HIGH** — correctness bug that will hit production.
- **MED** — drift, quality, or degraded UX.
- **LOW** — hardening, hygiene, or polish.
- **NIT** — style only.

---

## 1. Server (apps/api)

### `apps/api/src/shared/lib/socket.ts`

#### CRIT

- **C7 — Redis pub/sub clients leak on shutdown** (`socket.ts:16-17`)
  `pubClient` / `subClient = redis.duplicate()` are never `.quit()`-ed. `index.ts:46` only closes the base redis client. File-descriptor leak per HMR cycle and per multi-instance restart.

- **C14 — No socket connect rate limit** (`socket.ts:55-117`)
  ADR-004 promised "1 per user per second" — unimplemented. Trivial DoS vector on `/collab`, `/tasks`, `/notifications`.

#### HIGH

- **H5 — `join-task` does 2 sequential DB reads** (`socket.ts:84-104`)
  Sequential `prisma.task.findUnique` + `prisma.workspaceMember.findFirst`. N+1 on a hot path.

- **H6 — Async handlers lack `try/catch`** (`socket.ts:61-76, 84-104`)
  DB error or thrown exception inside the handler → unhandled rejection → silent fail, no `error:emit` to client.

- **H14 — Membership never re-validated for subsequent emits** (`socket.ts:61-76`)
  A user removed from a workspace keeps their rooms and keeps receiving `conversation:*` / `task:*` events until they disconnect.

- **H26 — `getSocket` stuck-reconnect bug** (`socket.ts:10-13`)
  `getSocket` only replaces the cached socket when `disconnected === true`. A socket stuck in `connect_error` / `reconnecting` is never replaced → caller keeps using a dead handle.

#### MED

- **M7 — `leave-workspace` / `leave-task` don't validate** (`socket.ts:78-82, 106-110`)
  Client can spam leaves (or leave rooms it never joined). Server should idempotently no-op or rate-limit.

- **M8 — `socket.rooms.forEach(leave)` on disconnect is redundant** (`socket.ts:112-116`)
  Socket.IO already auto-cleans on `disconnect`. The loop is dead code that hides real cleanup logic.

- **L20 — `presence:join` reads `prisma` without membership cache** (see also `realtime.gateway.ts:106-127`)
  Other presence paths use `getCachedMembership`; `presence:join` re-queries Prisma directly → 30s membership cache bypassed.

### `apps/api/src/shared/lib/socket-events.ts`

#### CRIT

- **C8 — Module-level `ioRef` HMR hazard** (`socket-events.ts:17, 19-21`)
  `ioRef` is a module-level singleton. Under `tsx watch` HMR, the new module copy sees a stale `ioRef` from the previous instance → emits become no-ops or throw on a closed server.

#### HIGH

- **H23 — `ServerEmitEvents` doesn't type `message:*` / `presence:*` / `notification:*`** (`socket-events.ts:9-15`)
  Compile-time gap: callers pass `unknown` payloads, the registry is silent, drift accumulates silently.

- **H13 — `safeEmit` swallows errors** (related, also `chat.message.service.ts:109-131, 155-179, 202-211`)
  `safeEmit` returns void; HTTP 200 sent before realtime confirms delivery. No metric, no caller-side compensation. Outcome: message persisted but client cache never updated until next invalidation.

### `apps/api/src/modules/realtime/realtime.gateway.ts`

#### CRIT

- **C9 — Sweeper interval leak** (`realtime.gateway.ts:120-121`)
  `sweeperStop` is a module-level `let`. On a second `createSocketServer` call the first interval is orphaned — `clearInterval` only fires on the overwritten reference.

#### HIGH

- **H7 — `presence:heartbeat` doesn't re-check workspace membership** (`realtime.gateway.ts:129-137`)
  Removed users keep broadcasting presence forever.

- **H8 — `HSET` + `EXPIRE` non-atomic** (`realtime.gateway.ts:66-75`)
  Process death between the two commands leaves a key with no TTL → permanent presence ghost.

- **H9 — Sweeper has no in-flight mutex** (`realtime.gateway.ts:160-177`)
  Overlapping sweeps can both detect and broadcast the same offline event.

#### MED

- **M9 — `scanPresenceKeys` `COUNT 100` with no upper bound** (`realtime.gateway.ts:25-34`)
  Under a presence storm, scan cost grows linearly; no `MATCH` pattern, no cursor.

- **M10 — Off-by-one in presence sweeper** (`realtime.gateway.ts:168`)
  `now - r.lastSeen > TTL_MS` treats the boundary as fresh. Should be `>=`.

### `apps/api/src/modules/chat/chat.service.ts`

#### CRIT

- **C6 — No channel-name uniqueness** (`chat.service.ts:60-84`)
  No `@@unique([workspaceId, name])` enforcement for non-deleted channels. `findFirst` check has a TOCTOU race; two concurrent `POST /channels` both succeed.

- **C10 — Private channels not enforced** (`chat.service.ts:8-28, 30-58`)
  `isPrivate: true` is stored but not filtered on read. Any workspace member can read any private channel and its messages.

#### HIGH

- **H10 — `updateChannel` has no transaction for dup-name check** (`chat.service.ts:86-121`)
  TOCTOU race on rename to an existing name.

- **H11 — `deleteChannel` doesn't emit `channel:deleted`** (`chat.service.ts:123-135`)
  Same for `create` / `update`. Channels-list cache goes stale until next page reload.

- **H12 — No role guard on channel CRUD** (`chat.service.ts:60-135`)
  Any workspace member (including `GUEST`) can create, rename, and delete channels.

- **H20 — `@@unique([workspaceId, name])` is not partial** (`packages/db/prisma/schema.prisma:379`)
  Soft-deleted channel names block reuse even after delete.

#### MED

- **M14 — Response-shape mapping duplicated 4× verbatim** (`chat.service.ts:11-27, 41-57, 74-83, 111-120`)
  Single helper would prevent drift between the four `serializeChannel` copies.

### `apps/api/src/modules/chat/chat.message.service.ts`

#### CRIT

- **C3 — Author self-echo missing** (`chat.message.service.ts:111-127, 159, 206`)
  Chat emits to `/collab` `workspace:{wid}`. The author's socket is on `/collab` only if they called `presence:join`, which joins `/tasks` — not `/collab`. Result: the author never receives their own message via realtime.

- **C4 — Message + notification not atomic** (`chat.message.service.ts:69-107`)
  `repo.create` + `commentRepo.createManyNotifications` are not in `prisma.$transaction`. Notification write fails → message is persisted, no notification, no error returned to caller.

- **C5 — Over-broad notification echo** (`chat.message.service.ts:94-99`)
  `findNotificationsSince(recipientIds, 'COMMENT_REPLY', message.createdAt)` returns **all** `COMMENT_REPLY` notifications for those users `>= message.createdAt`. Re-emits unrelated notifications and previous messages' notifications. Duplicate notification echoes.

- **C13 — PII leak: `author.email` in socket emit** (`chat.message.service.ts:122-127, 170-175`)
  `author.email` is included in every `message:new` / `message:update` payload. Every workspace member receives every chat author's email — privacy breach.

#### HIGH

- **H13 — DB write first, then `safeEmit` swallows** (`chat.message.service.ts:109-131, 155-179, 202-211`)
  HTTP 200 returned, realtime may have missed the event, no metric, no compensation.

- **H21 — Cursor pagination uses non-unique `createdAt` + `skip: 1`** (`chat.message.service.ts:28-43`)
  Two messages with identical `createdAt` can be skipped across the cursor boundary.

#### MED

- **M11 — Sequential `safeEmit` per notification** (`chat.message.service.ts:100-106`)
  N+1 round trips per mention fan-out.

### `apps/api/src/modules/chat/chat.repository.ts`

#### HIGH

- **H18 — "Latest message" projection duplicated** (`chat.repository.ts:4-16, 22-33`)
  Two near-identical `include` blocks. Drift risk; the audit hit one with a missing `deletedAt` filter.

#### LOW

- **L9 — `findUnique` has no `workspaceId` composite** (`chat.repository.ts:18-20`)
  Repository exposes a raw `findUnique` on `id` only; callers must remember to re-check workspace scope. Wrap in `findByIdScoped(ws, id)`.

- **L8 — `findByChannel` defined but never called** (`chat.message.repository.ts:8-4`)
  Dead code; remove or wire up.

### `apps/api/src/modules/chat/chat.message.repository.ts`

#### HIGH

- **H19 — `updateContent` sets `updatedAt: new Date()` manually** (`chat.message.repository.ts:33-49`)
  Prisma's `@updatedAt` already manages this — manual write fights the auto-update and can leave stale timestamps.

- **H22 — Chat schemas duplicated, not shared** (`packages/shared/src/chat.ts` + `chat.schema.ts` + `chat.message.schema.ts`)
  API has zero imports from `@flow-desk/shared/chat`. Two copies have already diverged.

#### LOW

- **L11 — `chatMessageViewSchema` exported but never used** (`chat.message.schema.ts:28-37`)
  Dead export. Move into `packages/shared/src/chat.ts` and use it.

### `apps/api/src/modules/chat/chat.routes.ts` + `chat.message.routes.ts`

#### CRIT

- **C11 — Manual `.parse()` instead of `zValidator`** (`chat.routes.ts:49, 57` + `chat.message.routes.ts:40, 49`)
  Malformed JSON → `SyntaxError` → 500 (not 400). Wrong status code at a trust boundary.

#### MED

- **M13 — `chatRouter.onError((err, _c) => { throw err })` is a no-op** (`chat.routes.ts:72-74`)
  Re-throws without transformation; should remove or implement.

#### LOW

- **L10 — `listChannelsQuerySchema.cursor` unused by service** (`chat.routes.ts:19`)
  Query param accepted by validation, ignored by the service layer. Either wire it up or drop it from the schema.

### `apps/api/src/shared/middleware/access.ts`

#### HIGH

- **H15 — `assertMembership` returns 400 not 403** (`access.ts:8`)
  400 leaks the existence of the workspace to non-members. 403 is the correct "we know it exists, you can't see it" code.

### `apps/api/src/shared/middleware/rate-limit.ts`

#### HIGH

- **H16 — `RateLimitError.retryAfter` = window size, not seconds-until-reset** (`rate-limit.ts:60`)
  Clients retry too early and trip the limit again. Should be `resetEpoch - nowSec`.

### `apps/api/src/index.ts`

#### CRIT (cross-file)

- **C7** — pub/sub `quit()` not awaited on shutdown (see `socket.ts:16-17`).

#### LOW

- **L13 — `email-worker` service has no healthcheck in `docker-compose.yml:79-98`**
  Stalled worker is invisible to `docker compose ps`.

- **L15 — Redis has no `appendfsync everysec` policy in compose**
  AOF is off or default. Crash loses last-second presence / rate-limit state.

- **L16 — No resource limits in compose (`mem_limit`, `cpus`)**
  One bad container can starve the rest.

---

## 2. Client (apps/web)

### `apps/web/src/lib/socket.ts`

#### CRIT

- **C2 — StrictMode dev `startedRef` bug** (`socket.ts:43-60`)
  `startedRef.current = true` is set, never reset. React 18 StrictMode unmount → remount runs the effect a second time, the second run early-returns, and `connect` / `disconnect` listeners are never re-attached. `connected` state is permanently wrong in dev.

#### HIGH

- **H24 — JWT token read once at socket creation and pinned** (`socket.ts:19-36`)
  JWT refresh leaves the socket using a stale token. On reconnect, the server may reject the new connection or, worse, the client may be reconnecting with an expired token and silently dropping messages.

- **H26** (cross-ref `apps/api/src/shared/lib/socket.ts:10-13`) — `getSocket` stuck-reconnect.
  On the client, `getSocket` returns the same handle even when the underlying socket is in `reconnecting` state.

#### MED

- **L19 — `getSocket` called on every render, not memoized**
  Trivial re-renders tear down and re-create the socket handle in callers that store it in `useEffect` deps without memoization.

### `apps/web/src/features/chat/hooks.ts`

#### CRIT

- **C1 — Duplicate messages on send (client)** (`hooks.ts:73-90` `useSendMessage.onSuccess` + `:142-161` `useChatRealtime.onNew`)
  No dedupe by `id` or `clientMessageId`. `onSuccess` appends; the socket `message:new` echo appends again. **Every own message appears twice.**

#### HIGH

- **H1 — `useChatRealtime.onNew/onUpdated/onDeleted` return early for non-active channels** (`hooks.ts:142-203`)
  No `chatKeys.channels(wid)` invalidation. Previews on the channels list go stale for any non-active channel.

- **H2 — No `onMutate` optimistic insert** (`hooks.ts:68-95`)
  User sees no feedback during the POST round-trip. Feels broken on slow networks.

- **H3 — `useSendMessage.onSuccess` invalidates `chatKeys.channels(wid)`** (`hooks.ts:68-95`)
  Full refetch races with `onNew` invalidation. Two HTTP round trips per send.

- **H25 — `refetchOnWindowFocus: false`** (`apps/web/src/lib/query-client.ts:9`)
  User switches tabs and back → does not see new messages. Chat should be `true` for chat families.

#### MED

- **M3 — `setQueryData` updater logic duplicated 4×** (`hooks.ts:73-90, 144-203`)
  Extract a helper (`patchChannelInList`, `appendMessageIfNew`, `replaceMessageById`, `removeMessageById`).

- **M4 — If `old.pages.length === 0`, optimistic message is dropped** (`hooks.ts:73-90`)
  Next mount re-fetches from server; in the meantime the message is invisible.

- **M5 — `useUpdateMessage` / `useDeleteMessage` have no optimistic cache update** (`hooks.ts:97-122`)
  Only `invalidateQueries` → flicker on every edit / delete.

### `apps/web/src/features/chat/components/ChannelView.tsx`

#### MED

- **M1 — Auto-scroll on every length increase** (`ChannelView.tsx:32-37`)
  No "stick to bottom" detection. Scrolls up while the user is reading older messages.

### `apps/web/src/features/chat/components/MessageBubble.tsx`

#### MED

- **M6 — Time/date formatting recomputed per render**
  `timeAgo` says "1m" for an hour-old message.

#### LOW

- **L6 — `MessageBubble` not memoized**
  Channel list re-renders trigger every bubble to re-render even when props are stable.

### `apps/web/src/features/chat/components/TaskChat.tsx`

#### HIGH

- **H4 — Parallel non-realtime chat** (`TaskChat.tsx:43-60`)
  Messages from others never appear without a manual refresh. Task-scoped chat is on a parallel path that ignores the realtime layer.

#### MED

- **M2 — Auto-scrolls on every `data` ref change** (`TaskChat.tsx:62-64`)
  Background refetches cause the list to jump.

#### LOW

- **L7 — `TaskChat` Enter handler duplicated with `ChatInput.tsx`**
  Two copies of the same submit logic.

### `apps/web/src/features/chat/components/ChannelItem.tsx`

#### MED

- **M6** (cross-ref) — `timeAgo` no auto-refresh (`ChannelItem.tsx:10-18`)
  "5m" stays "5m" even after 10 minutes.

### `apps/web/src/features/board/hooks/useMoveTask.ts`

#### HIGH

- **H17 — `queryKey` new ref each render** (`useMoveTask.ts:72, 77-91`)
  Effect re-runs every render → listener thrash, dropped `move:*` events.

### `apps/web/src/components/layout/app-shell.tsx`

#### LOW

- **L17 — `activeWorkspaceId` parsed once, doesn't react to client-side navigation** (`app-shell.tsx:56-60`)
  After the user switches workspaces, `app-shell` keeps the old id until a hard reload.

---

## 3. Infrastructure

### Prisma schema (`packages/db/prisma/schema.prisma`)

#### CRIT

- **C12 — Missing `onDelete` cascade** (`schema.prisma:371, 386, 388`)
  `ChatChannel.workspace`, `ChatMessage.channel`, `ChatMessage.author` have no `onDelete` policy. Hard-deleting a workspace or a user orphans the message rows; FK constraint error on the next insert.

#### HIGH

- **H20** (cross-ref `chat.service.ts:60-84`) — `@@unique([workspaceId, name])` not partial.
  Soft-deleted names block reuse.

### Env validation (`packages/env/src/backend.ts`)

#### LOW

- **L1 — `DATABASE_URL: z.string().url()`** (`backend.ts:10`)
  `postgresql://` is a valid URL per WHATWG, but legacy `postgres://` prefixes are common. Verify the regex actually accepts both, otherwise prod deploys with `postgres://` fail validation.

- **L2 — `LLM_API_KEY` placeholder default** in `docker-compose.yml:12` and env schema.
  Real keys can be missing in production if the placeholder isn't replaced.

- **L3 — `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` not validated as duration strings** (`backend.ts`)
  `1d`, `15m`, `30s` are all valid for `ms()` — but `1day` is not. Either normalize or document the format.

- **L4 — OAuth all-or-nothing config not validated**
  `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` are all optional individually but required as a triplet. Auth routes currently return 501 for partial config; should fail at boot.

### Rate limit (`apps/api/src/shared/middleware/rate-limit.ts`)

#### HIGH

- **H16** (cross-ref) — `retryAfter` formula wrong.

### Error handler

#### MED

- **M13** (cross-ref `chat.routes.ts:72-74`) — `chatRouter.onError((err, _c) => { throw err })` is a no-op.
  No classification, no logging hook. A malformed JSON body raises `SyntaxError` (C11) and reaches this with no `error:emit` back to the socket.

### Query client (`apps/web/src/lib/query-client.ts`)

#### HIGH

- **H25** (cross-ref) — `refetchOnWindowFocus: false` for chat families.

### Docker compose (`docker-compose.yml`)

#### LOW

- **L13** — `email-worker` no healthcheck.

- **L14 — `docker/web.Dockerfile` healthcheck** uses `wget -qO- http://localhost/` which returns 200 even if the SPA shell fails to render. Use `/api/health` instead or probe the actual SPA route.

- **L15** — Redis no `appendfsync everysec` policy.

- **L16** — No resource limits.

### Soft-delete extension

#### LOW

- **L5 — `softDeleteExtension` duplicated** between `apps/api/src/shared/lib/prisma-extension.ts` and `packages/db/src/prisma-extension.ts`.
  Drift risk: the API one was missing `SavedFilter` until session 024.

---

## 4. Cross-cutting answers

Verbatim from the audit summary:

- `useNamespacedSocket` StrictMode safety: **broken** (C2).
- `getSocket` disconnect/reconnect: only replaces when fully disconnected (H26).
- `useChatRealtime` listener cleanup on active channel switch: structurally correct, but `startedRef` bug upstream.
- `useSendMessage.onSuccess` dedupe with socket: **no** (C1).
- Optimistic message / `clientMessageId`: **none** (H2).
- `setQueryData` new ref or mutate: **new ref** (correct).
- Invalidation racing with socket update: `useSendMessage.onSuccess` invalidates the channels list and races with `onNew` (H3).
- Channel list live updates: **not implemented** (H11).
- Typing / presence / read receipts for chat: **not implemented**.
- Memory leaks: none in chat; module-level socket map never pruned.
- Stale closure issues: `useMoveTask` (H17); other hooks correct.

---

## Top 10 fixes (impact-ordered)

1. **C1 — Dedupe by `clientMessageId` on the client** (every own message currently appears twice).
2. **C2 — Fix `useNamespacedSocket` `startedRef` reset** (StrictMode breaks connection state in dev).
3. **C3 — Author self-echo via `/notifications user:{authorId}`** (author never sees their own message via realtime).
4. **C4 — Wrap `message` + `notifications` in `prisma.$transaction`** (silent data loss on notification write failure).
5. **C5 — Replace `findNotificationsSince` with `findNotificationsForMessage(messageId)`** (duplicate notification echoes).
6. **C10 — Enforce `isPrivate` ACL on channel reads** (privacy breach — any member reads any private channel).
7. **C13 — Drop `author.email` from socket emit** (PII leak to every workspace member).
8. **H1 — Invalidate channels list for non-active channels too** (previews go stale on the channels list).
9. **H2 + 1.7 — `clientMessageId` optimistic insert + ACK-aware `useSendMessage`** (no feedback during send).
10. **H22 — Consolidate chat schemas in `packages/shared/src/chat.ts`** (delete API-side duplicates, restore single source of truth).
