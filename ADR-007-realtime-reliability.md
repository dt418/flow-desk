# ADR-007: Real-time Chat Reliability — Pure-Socket, Dedupe, Channel Rooms

## Status

**Proposed.** Supersedes ADR-004's room model for chat messages. ADR-004 remains the source of truth for board / presence rooms on the `/tasks` and `/notifications` namespaces.

## Context

The Phase 0 audit (`REALTIME-AUDIT.md`) found **14 CRIT, 26 HIGH, 14 MED, and 30+ LOW** issues across server, client, and infrastructure. The high-frequency pain points are:

- **C1** Duplicate messages on send — `onSuccess` appends, socket echo appends again. No `clientMessageId` dedupe.
- **C2** `useNamespacedSocket` `startedRef` never resets; StrictMode breaks the connection state.
- **C3** Author self-echo missing — chat emits to `/collab` `workspace:{wid}`, author's socket is on `/tasks` via `presence:join`.
- **C4** `message` + `notifications` not atomic — silent data loss on notification write failure.
- **C5** Notification echo uses `findNotificationsSince` — re-emits unrelated notifications.
- **C6** No partial unique index on `(workspaceId, name)` for active channels — TOCTOU on create.
- **C7** Redis pub/sub clients leak on shutdown — FD leak per HMR.
- **C8** `ioRef` module-level singleton — HMR stale reference.
- **C9** Sweeper interval leaks across `createSocketServer` calls.
- **C10** Private channels not enforced — any member reads any private channel.
- **C11** Manual `.parse()` instead of `zValidator` — malformed JSON becomes 500, not 400.
- **C12** Missing `onDelete` cascade — orphan rows on workspace / author delete.
- **C13** `author.email` in every socket payload — PII leak to every workspace member.
- **C14** No socket `connection` rate limit — DoS vector.

Plus the high-frequency correctness bugs:

- **H1** Channels list cache stale for non-active channels.
- **H2** No optimistic insert — no feedback during send.
- **H3** `onSuccess` invalidates `chatKeys.channels` — two HTTP round trips per send.
- **H4** `TaskChat` is a parallel non-realtime path.
- **H5** `join-task` is N+1.
- **H6** Async handlers lack `try/catch`.
- **H7** `presence:heartbeat` doesn't re-check membership.
- **H8** `HSET` + `EXPIRE` non-atomic.
- **H9** Sweeper no in-flight mutex.
- **H10** `updateChannel` no transaction for dup-name check.
- **H11** `createChannel` / `updateChannel` / `deleteChannel` don't emit `conversation:updated`.
- **H12** No role guard on channel CRUD.
- **H13** `safeEmit` swallows errors — no metric, no caller compensation.
- **H14** Membership never re-validated for subsequent emits.
- **H15** `assertMembership` returns 400 not 403 — leaks workspace existence.
- **H16** `RateLimitError.retryAfter` is window size, not seconds-until-reset.
- **H17** `useMoveTask` `queryKey` new ref each render.
- **H18** "Latest message" projection duplicated.
- **H19** `updateContent` sets `updatedAt` manually.
- **H20** `@@unique([workspaceId, name])` is not partial — soft-deleted names block reuse.
- **H21** Cursor pagination uses non-unique `createdAt` + `skip: 1`.
- **H22** Chat schemas duplicated between API and `@flow-desk/shared`.
- **H23** `ServerEmitEvents` doesn't type `message:*` / `presence:*` / `notification:*`.
- **H24** JWT read once at socket creation — refresh leaves socket stale.
- **H25** `refetchOnWindowFocus: false` for chat families.
- **H26** `getSocket` stuck-reconnect never replaced.

The current `/collab` namespace is over-shared (everything in `workspace:{wid}`), the chat path uses `safeEmit` that swallows errors, and there is no concept of an idempotent send, ACK, or per-channel room. The result is a chat layer that works in the happy path and breaks visibly in every other path.

## Decision

Adopt a production-ready chat realtime layer that mirrors Slack / Discord / Linear:

1. **Pure-socket sends.** All `message:send` traffic goes through the socket. The REST `POST /channels/:id/messages` route is deleted. The server's socket handler returns a typed ACK.
2. **`clientMessageId` dedupe.** Every client-generated message carries a `clientMessageId` (UUID v4). The server has a partial unique index on `(authorId, clientMessageId) WHERE clientMessageId IS NOT NULL`. A retry with the same `clientMessageId` is idempotent — the server returns the existing message, not a duplicate.
3. **Channel-scoped rooms.** Replace the broadcast-everything-to-`workspace:{wid}` pattern with `conversation:{channelId}` rooms. A user joins exactly the channels they currently have open.
4. **`setQueryData` only on realtime events.** No `invalidateQueries` triggered by socket events. The client owns the cache; the server is the source of truth, but the client reconciles via `setQueryData` patches.
5. **Structured errors.** Every socket payload is Zod-validated. Validation failure emits `error:emit` to that socket with `{ event, code, message }`. Service-layer emit failures return `Result<void, EmitError>` to callers; callers decide whether to log, retry, or surface.

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│  Shared (packages/shared)                                  │
│  ─ chat.ts            Zod schemas (createChatMessage,      │
│                       chatMessageView, MessageStatus)      │
│  ─ socket-events.ts   SOCKET_EVENTS + SOCKET_ROOMS         │
│                       registry (single source of truth)    │
└──────────────────────────┬─────────────────────────────────┘
                           │ imported by both apps
┌──────────────────────────┴─────────────┬────────────────────┐
│  API (apps/api)                        │  Web (apps/web)    │
│  ─ socket-handlers.ts                  │  ─ lib/socket.ts   │
│    Zod-validated, typed emit           │    singleton, JWT  │
│  ─ chat.message.service.ts             │      refresh hook  │
│    $transaction wrap, drops PII,       │  ─ features/chat/  │
│    echoes clientMessageId              │    hooks.ts        │
│  ─ chat.service.ts                     │    useSendMessage  │
│    ACL, partial unique index,          │    pure-socket ACK │
│    emits conversation:updated          │  ─ cache.ts        │
│  ─ realtime.gateway.ts                 │    setQueryData    │
│    sweeper, presence, conversation     │    helpers         │
│    room helpers                        │  ─ components/     │
│                                        │    ChatPanel       │
│                                        │    (unified)       │
└────────────────────────────────────────┴───────────────────┘
```

Three layers, single direction of dependency:

1. **Schemas** in `packages/shared` — imported by both apps, no drift.
2. **Server** wraps `io.of(ns).to(room).emit` in a typed `emit` that surfaces errors.
3. **Client** owns the cache via `setQueryData`; the socket is the only mutation path during a session.

## Room Model

| Room | Purpose | Audience |
|------|---------|----------|
| `conversation:{channelId}` | All chat events for a single channel (message:new/update/delete, typing, read receipts, presence) | Users currently viewing that channel |
| `workspace:{wid}` | Board events (task:create/update/move/delete), workspace-level presence | All workspace members (existing ADR-004 contract) |
| `user:{userId}` | Per-user notification stream, self-echo of own messages | The owning socket only |
| `task:{tid}` | Task-scoped chat + typing + presence for a task channel | Users currently viewing that task (Phase 2) |

`conversation:{channelId}` is new and replaces the broadcast pattern from `/collab` `workspace:{wid}` for chat messages. The other rooms are unchanged from ADR-004.

## Event Catalog

| Event | Direction | Payload schema | When |
|-------|-----------|----------------|------|
| `conversation:join` | C → S | `{ channelId: string }` | User opens a channel; server validates membership and joins `conversation:{channelId}` |
| `conversation:leave` | C → S | `{ channelId: string }` | User navigates away |
| `conversation:updated` | S → C | `conversationUpdatedSchema` | Channel created, renamed, deleted, ACL changed, or membership changed |
| `message:send` | C → S → S | `createChatMessageSchema` (with `clientMessageId`) | User submits a message; server ACKs with `{ ok, message }` or `{ ok: false, error }` |
| `message:new` | S → C | `chatMessageViewSchema` | New message persisted; emit to `conversation:{channelId}` and `user:{authorId}` (self-echo) |
| `message:update` | S → C | `chatMessageViewSchema` | Edit persisted; same rooms as `message:new` |
| `message:delete` | S → C | `{ id: string, channelId: string, clientMessageId?: string }` | Soft-delete persisted; same rooms as `message:new` |
| `message:read` | C → S → S → C | `{ channelId, upToMessageId, userId, readAt }` | User scrolls past a message; server writes to `ChatMessageRead` and broadcasts to `conversation:{channelId}` |
| `presence:update` | S → C | `{ channelId, viewers: Array<{ userId, name, avatarUrl }> }` | Per-channel viewer set changes (Phase 3) |
| `user:online` / `user:offline` | S → C | `{ userId, at }` | Workspace-level presence (existing ADR-004) |
| `typing:start` | C → S → C | `{ channelId, userId, at }` | First keystroke in the input; server broadcasts to `conversation:{channelId}` excluding sender |
| `typing:stop` | C → S → C | `{ channelId, userId }` | Input blur, send, or 4s inactivity |
| `error:emit` | S → C | `{ event: string, code: string, message: string }` | Zod validation failure, service-layer error, ACL denial |
| `ack` | S → C | `{ event: string, ok: boolean, error?: EmitError }` | Typed response to `message:send` |

## Message Send Flow

```
client                     server                      db
  │                          │                          │
  │  message:send {          │                          │
  │    content,             │                          │
  │    clientMessageId,     │                          │
  │    mentionedUserIds     │                          │
  │  }                      │                          │
  │ ───────────────────────►│                          │
  │                          │  Zod parse               │
  │                          │ ─────                    │
  │                          │  lookup existing         │
  │                          │  by (author,             │
  │                          │     clientMessageId)     │
  │                          │ ───────────────────────► │
  │                          │                          │
  │                          │ ◄─────── exists? ─────── │
  │                          │                          │
  │                          │  $transaction(           │
  │                          │    create message        │
  │                          │    + createMany          │
  │                          │      notifications)      │
  │                          │ ───────────────────────► │
  │                          │ ◄───── ok ──────────────│
  │                          │                          │
  │                          │  emit message:new        │
  │                          │  to conversation:{cid}   │
  │                          │  + user:{authorId}       │
  │                          │  (self-echo)             │
  │                          │                          │
  │  ack { ok, message }     │                          │
  │ ◄─────────────────────── │                          │
  │                          │                          │
  │  message:new             │                          │
  │ ◄─────────────────────── │                          │
  │  (replace optimistic     │                          │
  │   entry by              │                          │
  │   clientMessageId)      │                          │
  │                          │                          │
```

## Dedupe Strategy

Three layers, all required:

1. **Client** generates `clientMessageId` (UUID v4) at send time and stores it on the optimistic message. The `onMutate` cache insert uses `clientMessageId` as the dedupe key. `useSendMessage` does **not** use `invalidateQueries` — the optimistic entry is replaced in place when the server's `message:new` echo arrives with the same `clientMessageId`.
2. **Server** has a partial unique index on `ChatMessage(authorId, clientMessageId) WHERE clientMessageId IS NOT NULL`. A retry with the same `clientMessageId` is caught as `P2002` and the existing message is returned. The optimistic ACK payload and the broadcast both carry the same `clientMessageId` so the client can reconcile.
3. **Replace by `clientMessageId` on echo.** When `message:new` arrives on the client, the listener searches the cache for the optimistic entry by `clientMessageId` and replaces it with the canonical server message (with `id`, `createdAt`, `status: 'sent'`).

The triple guarantees: a user can mash the send button, the network can drop the ACK, the client can retry — and exactly one message ever appears in the channel.

## Acknowledgement

`message:send` is the only event that requires an ACK (everything else is fire-and-forget).

- **Timeout**: 5 seconds. Configurable via `CHAT_SEND_TIMEOUT_MS` (Phase 3).
- **Status**: the optimistic message carries `status: 'sending'` on insert. The ACK flips it to `status: 'sent'`. A timeout flips it to `status: 'failed'` and surfaces a resend button.
- **Resend**: the resend button re-emits with the **same** `clientMessageId`. The server's partial unique index collapses the retry onto the existing message, so the user never sees a duplicate.

The 5-second window is generous for happy-path networks and short enough that a stuck user notices and acts. Anything longer means the connection is dead; the client should also surface a "reconnecting…" indicator.

## Typing Indicators

Lightweight, no DB writes.

- Client throttles `typing:start` to one per 200ms while the user is actively typing.
- Client emits `typing:stop` on input blur, on send, and on 4 seconds of inactivity.
- Server broadcasts to `conversation:{channelId}` excluding the sender. No persistence.
- Server auto-stops on socket `disconnect`.

## Presence

Two levels:

- **Workspace presence** (existing ADR-004): `HSET presence:{wid} {userId} {lastSeen}` + `EXPIRE` (atomic via Lua). Heartbeat every 15s, sweeper evicts after 30s.
- **Channel presence** (Phase 3): on `conversation:join`, the server adds the user to a per-channel viewer set. On `conversation:leave` or `disconnect`, removed. Server emits `presence:update` to `conversation:{channelId}` with the new viewer list (id, name, avatarUrl — no email).

Channel presence is a `SADD` per join and `SREM` per leave; viewer set is computed on demand by `SMEMBERS`.

## Read Receipts

- `ChatMessageRead` join table: `(userId, channelId, messageId, readAt)` with `@@unique([userId, channelId, messageId])`.
- Client emits `message:read { channelId, upToMessageId }` when the user scrolls past a message or opens a channel. The server upserts the latest read marker per `(userId, channelId)`.
- Server broadcasts `message:read` to `conversation:{channelId}`.
- Client maintains a `lastReadByUser` map per channel and renders "Read by N" on each `MessageBubble`.

The `(userId, channelId, messageId)` unique index makes read receipts idempotent; resends collapse onto the same row.

## Phase Plan

| Phase | Goal | Gate |
|-------|------|------|
| **0** | Scope lock, ADR, audit, plan, feature row | Docs reviewed; commit `docs(plan): realtime chat refactor audit + ADR-007 + plan` |
| **1** | Chat realtime reliability — fix the user-reported symptoms (C1, C3, C4, C5, C13, H1, H2, H3) | `pnpm verify` + `pnpm exec playwright test e2e/chat-realtime.spec.ts` 8 cases; `git tag phase-1-realtime-reliability` |
| **2** | Event standardization + room model — `SOCKET_EVENTS` / `SOCKET_ROOMS` registry, Zod-validated payloads, switch to `conversation:{id}` room, drop `invalidateQueries` on realtime, delete duplicated chat schemas, unify `TaskChat` via `scope=TASK` | Same as phase 1; `git tag phase-2-events-rooms` |
| **3** | Optimistic ACK + typing + chat presence + read receipts + `conversation:updated` | Same as phase 2; `git tag phase-3-ack-typing-presence-reads` |
| **4** | Hardening — 403 ACL, private channels, cascade migration, partial unique index, soft-delete consolidation, socket rate limit, `useMoveTask` memoization, `refetchOnWindowFocus`, pub/sub client cleanup, JWT refresh, `getSocket` stuck-reconnect, member cache invalidation, `LLM_API_KEY` required, JWT TTL validation, cluster hash-tag | `pnpm verify` end-to-end; `git tag phase-4-hardening` |

Each phase is independently shippable. The phase gate is run before advancing.

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|--------------|
| **REST polling** | Latency, bandwidth, server load. No real-time UX. ADR-004 already rejected this. |
| **SSE (Server-Sent Events)** | One-way only. Can't send `message:send` or `typing:start` from client to server efficiently. |
| **Long polling** | Slow, high CPU, legacy. ADR-004 already rejected this. |
| **Event sourcing with a log (Kafka / NATS JetStream)** | Overkill for chat. Chat is fan-out, not stream-replay. The idempotency we need is well-served by the partial unique index on `(authorId, clientMessageId)`. |
| **Single shared `workspace:{wid}` room for everything** | Currently used. Bandwidth: every chat author email broadcast to every workspace member (C13). No per-channel fan-out. No way to scope typing or read receipts. |
| **`safeEmit` keeps swallowing errors** | The "easy" path. Loses information at the trust boundary; no caller compensation; no metric. Replaced with `Result<void, EmitError>` from `emit`. |
| **REST `POST /channels/:id/messages` kept as fallback** | Two paths to do the same thing. Diverges. The pure-socket model is simpler and faster. |
| **Soft-delete extension duplicated** (current) | Drift between `apps/api` and `packages/db` copies. Consolidate to `packages/db` (Phase 4.5). |

## Consequences

### Positive

- **No duplicates** — `clientMessageId` + partial unique index + replace-by-id-on-echo is end-to-end idempotent.
- **No missing messages** — pure-socket send with ACK + `setQueryData` reconciliation means the cache is always consistent.
- **Bandwidth** — `conversation:{channelId}` is a tight fan-out; per-channel presence is a small `SADD` / `SREM`.
- **Observable** — every emit returns `Result<void, EmitError>`; callers can log, alert, and retry.
- **Type-safe** — `SOCKET_EVENTS` registry + Zod schemas catch drift at compile time and at the trust boundary.
- **Privacy** — `author.email` is gone from the socket payload (C13). All sockets carry the minimal `{id, name, avatarUrl}`.

### Negative

- **Phase 3 removes the `POST /channels/:id/messages` REST route.** External clients (mobile, integrations) that relied on it need a migration story. Mitigation: keep the route in Phase 2 as a shim that emits `message:send` server-side, delete it in Phase 3.
- **`setQueryData` is the only mutation path on realtime.** A misbehaving listener that corrupts the cache will not be caught by a refetch. Mitigation: each cache helper (`appendMessageIfNew`, `replaceMessageById`) is unit-tested with golden inputs / outputs.
- **Pure-socket sends depend on socket health.** A user offline cannot send. Mitigation: the message composer accepts a queued send; on reconnect the queued messages are flushed in order with their `clientMessageId`s.

### Risks

- **HMR / `tsx watch` hazards** (C8). Mitigation: `ioRef` is replaced with a hot-reload-safe getter that imports lazily.
- **Pub/sub client leak** (C7). Mitigation: shutdown handler awaits `pubClient.quit()` and `subClient.quit()`.
- **Sweeper interval leak** (C9). Mitigation: `sweeperStop` lives in a closure, not at module scope.
- **Partial unique index migration** — adding the index in a live DB requires a `CREATE UNIQUE INDEX CONCURRENTLY` to avoid table locks. Migration is additive and uses `CONCURRENTLY`.

## Security

- **Auth**: JWT validated on `connection` (existing ADR-004 contract). `socket.data.userId` is the only trusted source.
- **Authz**: every emit and every room join re-validates workspace membership. `assertMembership` returns 403, not 400 (H15). Private channels are filtered by ACL (C10).
- **Validation**: every socket payload is Zod-validated (C11, Phase 2). Validation failure emits `error:emit` with the offending event name and a stable code; the server logs the failure with `requestId` and `userId` for correlation.
- **Rate limiting**: socket `connection` events are rate-limited per user (C14, Phase 4). Per-event rate limits (e.g., `message:send` 5/sec per user) are added in Phase 4 with cluster hash-tag so the limit is consistent across API instances.
- **PII**: `author.email` is never sent over the wire (C13). The socket view of a user is always `{id, name, avatarUrl}`. The full user object is only available via `GET /api/users/:id` (which has its own authz).
- **Idempotency**: `clientMessageId` + partial unique index prevents replayed messages from creating duplicates.
- **Transport**: TLS termination at the reverse proxy; cookies are `httpOnly`, `secure` in production, `sameSite=lax`.

## References

- `REALTIME-AUDIT.md` — full audit findings (this directory).
- `docs/superpowers/plans/2026-07-07-realtime-chat-refactor.md` — 4-phase implementation plan with task-level detail.
- `ADR-004-realtime-socketio.md` — superseded for chat rooms only; remains the source of truth for `/tasks` / `/notifications` namespaces and the existing board presence rooms.
- `ADR-001-monorepo.md` — monorepo contract that puts all shared Zod schemas in `packages/shared`.
