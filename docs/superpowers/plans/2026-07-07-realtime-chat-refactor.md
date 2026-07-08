# Realtime Chat Reliability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Steps use `- [ ]` checkbox syntax.
>
> **Goal:** Refactor FlowDesk's chat realtime layer into a production-ready system matching Slack/Discord/Linear: pure-socket sends, optimistic UI with ACK, dedupe by `clientMessageId`, channel-scoped rooms, typing/presence/read-receipts, structured errors, Zod-validated socket payloads, no duplicates, no missing messages, no stale cache.
>
> **Architecture:** Three layers — (1) shared Zod schemas in `packages/shared`, (2) Hono services emit via a typed `socket-events` helper that wraps `io.of(ns).to(room).emit`, (3) React hooks own the cache via `setQueryData` only (no `invalidateQueries` on realtime events). Client uses `clientMessageId` for optimistic insert + replace on echo. Server uses `Prisma.$transaction` for `message + notifications` atomicity. Room model: `conversation:{channelId}` for chat messages; `workspace:{wid}` for board presence; `user:{userId}` for per-user events.
>
> **Tech Stack:** React 18 + Vite + TanStack Query v5 + socket.io-client 4.8. Hono + Node 22 + Prisma 7.8 + Redis 7 + ioredis. Zod 3.23. pnpm 11.8 + Turborepo. Playwright 1.61 (E2E).

## Global Constraints

- ADR-007 replaces ADR-004's room model for chat; ADR-004 stays for board/presence.
- All new schemas in `packages/shared/src/chat.ts`; API imports from `@flow-desk/shared/chat`. API's local `chat.schema.ts` + `chat.message.schema.ts` deleted.
- No `console.log` in non-test source. Use `logger`.
- No `any`. ESLint must stay at 0 errors.
- Each phase ends with: `pnpm typecheck && pnpm lint && pnpm --filter ... test:unit && pnpm --filter ... test:integration && pnpm build` all green.
- Conventional Commits. One commit per task. No `--no-verify`.
- Migration is additive only (per `claude-progress.md` Phase 1–2 hygiene).

## File Structure (new + modified)

### Backend (apps/api)

| Path                                                       | Change                                                                                            | Phase   |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------- |
| `apps/api/src/modules/realtime/realtime.gateway.ts`        | Add conversation room, typing, presence, ack helpers                                              | 1–3     |
| `apps/api/src/modules/realtime/schemas.ts` (new)           | Zod schemas for every socket event payload                                                        | 1–2     |
| `apps/api/src/modules/chat/chat.service.ts`                | Add `isPrivate` ACL, role guard, transaction wrap, emit `conversation:updated`                    | 1, 2, 4 |
| `apps/api/src/modules/chat/chat.message.service.ts`        | Transaction wrap, clientMessageId echo, drop author.email, use `findNotificationsForMessage`      | 1       |
| `apps/api/src/modules/chat/chat.repository.ts`             | Drop duplicate latestMessage include; add `findByIdScoped(ws, id)`                                | 1, 4    |
| `apps/api/src/modules/chat/chat.message.repository.ts`     | Add `findNotificationsForMessage`; drop manual updatedAt                                          | 1, 4    |
| `apps/api/src/modules/chat/chat.routes.ts`                 | Replace `.parse()` with `zValidator`; drop `onError` no-op                                        | 4       |
| `apps/api/src/modules/chat/chat.message.routes.ts`         | Same as above; TaskChat routes reuse                                                              | 2, 4    |
| `apps/api/src/modules/chat/task-chat.service.ts` (new)     | Task-scoped channel helper                                                                        | 2       |
| `apps/api/src/modules/chat/chat.schema.ts`                 | **DELETE**                                                                                        | 2       |
| `apps/api/src/modules/chat/chat.message.schema.ts`         | **DELETE**                                                                                        | 2       |
| `apps/api/src/shared/lib/socket.ts`                        | Add `connection` rate limit, Zod payload validation, error event, sticky-session note, dispose fn | 1, 2, 4 |
| `apps/api/src/shared/lib/socket-events.ts`                 | Event-name typed registry; replace `safeEmit` with typed `emit` that surfaces errors              | 1, 2    |
| `apps/api/src/index.ts`                                    | `disposeSocketServer` on shutdown; await `io.close()`; pub/sub `.quit()`                          | 4       |
| `apps/api/src/shared/middleware/access.ts`                 | `assertMembership` returns 403                                                                    | 4       |
| `apps/api/src/shared/middleware/rate-limit.ts`             | `retryAfter = resetEpoch - nowSec`; chat-specific policies; cluster hash-tag                      | 4       |
| `apps/api/src/shared/lib/prisma-extension.ts`              | **DELETE** (use `packages/db` canonical)                                                          | 4       |
| `apps/api/src/shared/middleware/auth.ts` + `auth-cache.ts` | Wire `invalidateMembershipCache` on member add/remove/role-change                                 | 4       |

### Frontend (apps/web)

| Path                                                              | Change                                                                                                                                                                                                  | Phase   |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `apps/web/src/lib/socket.ts`                                      | Fix `startedRef` reset in cleanup; stuck-reconnect socket replacement; JWT refresh hook                                                                                                                 | 1, 4    |
| `apps/web/src/lib/query-client.ts`                                | `refetchOnWindowFocus: true` for chat families; per-query defaults                                                                                                                                      | 4       |
| `apps/web/src/features/chat/hooks.ts`                             | `clientMessageId` optimistic insert; ACK on `message:send`; switch rooms on `activeChannelId`; typing/presence/read-receipt listeners; pure-socket `useSendMessage` (no REST POST); `setQueryData` only | 1, 2, 3 |
| `apps/web/src/features/chat/components/ChannelView.tsx`           | Stick-to-bottom scroll; "sending"/"failed" status; resend button                                                                                                                                        | 1, 3    |
| `apps/web/src/features/chat/components/MessageBubble.tsx`         | Memoize; `isOwn` gates author label; show read receipts                                                                                                                                                 | 3, 4    |
| `apps/web/src/features/chat/components/ChatInput.tsx`             | Emit `typing:start` on focus, `typing:stop` on blur; 200ms throttle                                                                                                                                     | 3       |
| `apps/web/src/features/chat/components/ChannelItem.tsx`           | `useMemo` timeAgo + 60s refresh; unread badge; highlight on `conversation:updated`                                                                                                                      | 4       |
| `apps/web/src/features/chat/components/TaskChat.tsx`              | Replace with shared `ChatPanel` (unified)                                                                                                                                                               | 2       |
| `apps/web/src/features/chat/components/ChatPanel.tsx` (new)       | Unified chat surface (used by channel + task)                                                                                                                                                           | 2       |
| `apps/web/src/features/chat/components/TypingIndicator.tsx` (new) |                                                                                                                                                                                                         | 3       |
| `apps/web/src/features/chat/components/ReadReceipts.tsx` (new)    |                                                                                                                                                                                                         | 3       |
| `apps/web/src/features/realtime/useRealtime.ts`                   | Drop `qc` from deps; re-emit join on `connect` (already done)                                                                                                                                           | 1       |
| `apps/web/src/pages/chat.tsx`                                     | Use `ChatPanel`                                                                                                                                                                                         | 2       |

### Shared + DB

| Path                                                          | Change                                                                                                                                                                                                            | Phase      |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `packages/shared/src/chat.ts`                                 | All chat Zod schemas; `clientMessageId`; `MessageStatus` enum; `conversation:updated` event                                                                                                                       | 1, 2, 3    |
| `packages/shared/src/socket-events.ts` (new)                  | Event name registry + payload type map (client + server consume)                                                                                                                                                  | 2          |
| `packages/db/prisma/schema.prisma`                            | Add `scope` + `taskId` to `ChatChannel`; `MessageStatus` enum; `ChatMessageRead` model; partial unique index for channel name; `onDelete: Cascade` on channel/workspace, `SetNull` on author; `@@index` additions | 1, 2, 3, 4 |
| `packages/db/prisma/migrations/20260707_realtime_chat/` (new) | Additive migration for all schema changes                                                                                                                                                                         | 1, 2, 3, 4 |
| `packages/db/src/prisma-extension.ts`                         | Add `findUnique`/`findUniqueOrThrow` overrides for soft-delete (consolidate)                                                                                                                                      | 4          |

### Tests + Docs

| Path                                                          | Change                                                                                            | Phase   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------- |
| `e2e/chat-realtime.spec.ts` (new)                             | Playwright 2-browser: dedupe, channels list, ACK, typing, presence, read receipts, offline→online | 1, 2, 3 |
| `docs/superpowers/plans/2026-07-07-realtime-chat-refactor.md` | This plan                                                                                         | 0       |
| `ADR-007-realtime-reliability.md`                             | New ADR: room model, event names, dedupe, ACK                                                     | 0       |
| `REALTIME-AUDIT.md`                                           | 100+ findings table                                                                               | 0       |
| `feature_list.json`                                           | Add feature row for the refactor with phase gates                                                 | 0       |
| `claude-progress.md`                                          | Session record                                                                                    | end     |

---

## Phase 0 — Scope Lock & Documentation (gate: docs reviewed)

### Task 0.1: Write audit + ADR + plan docs

**Files:**

- Create: `docs/superpowers/plans/2026-07-07-realtime-chat-refactor.md` (this file)
- Create: `ADR-007-realtime-reliability.md`
- Create: `REALTIME-AUDIT.md`
- Modify: `feature_list.json` (append feature row `realtime-chat-refactor`)
- Modify: `claude-progress.md` (session record)

- [ ] Write `REALTIME-AUDIT.md` with the audit findings (server / client / infra sections, severity column)
- [ ] Write `ADR-007-realtime-reliability.md` covering: room model, event names, `clientMessageId`, pure-socket send, dedupe strategy, ACK, typing/presence/read-receipts
- [ ] Add `feature_list.json` row with 4 phases + verification gates
- [ ] Update `claude-progress.md` with this session's record
- [ ] Commit: `docs(plan): realtime chat refactor audit + ADR-007 + plan`

### Task 0.2: Verify baseline

- [ ] `pnpm install`
- [ ] `pnpm --filter @flow-desk/shared build`
- [ ] `pnpm typecheck` (all packages)
- [ ] `pnpm lint` (0 errors)
- [ ] `pnpm --filter ... test:unit`
- [ ] `pnpm --filter ... test:integration`
- [ ] `pnpm build`

**Gate:** If any check fails, stop. Fix baseline first.

---

## Phase 1 — Chat Realtime Reliability (user's reported symptoms)

Goal: fix duplicate messages, stale channels list, missing self-echo, PII leak, no transaction. Verifiable with offline→online test + new dedupe assertion.

### Task 1.1: Add `clientMessageId` to message schema (shared)

**Files:** `packages/shared/src/chat.ts`

```ts
export const createChatMessageSchema = z.object({
  content: nonEmptyString.max(4000),
  mentionedUserIds: z.array(cuidSchema).default([]),
  clientMessageId: z.string().min(1).max(64),
});
```

Update `chatMessageViewSchema` to include `clientMessageId`. Add unit tests.

### Task 1.2: Server: drop `author.email` + accept `clientMessageId`

**Files:** `apps/api/src/modules/chat/chat.message.service.ts`, `chat.message.repository.ts`

Drop `email` from author select. Use only `id, name, avatarUrl`. Accept `clientMessageId` in `CreateChatMessageInput`. Echo it in emit.

### Task 1.3: Server: transaction-wrap message + notification

**Files:** `apps/api/src/modules/chat/chat.message.service.ts`, `chat.repository.ts`

Wrap `repo.create` + `commentRepo.createManyNotifications` in `prisma.$transaction`.

### Task 1.4: Server: replace `findNotificationsSince` with `findNotificationsForMessage(messageId)`

**Files:** `apps/api/src/modules/chat/chat.message.repository.ts`, `chat.message.service.ts`

Narrow notification echo to just the message id.

### Task 1.5: Server: self-echo via `/notifications user:{authorId}`

**Files:** `apps/api/src/modules/chat/chat.message.service.ts`

After `emitToRoom`, also `emitToUser(authorId, ...)` for the same event.

### Task 1.6: Client: fix `useNamespacedSocket` StrictMode `startedRef` bug

**Files:** `apps/web/src/lib/socket.ts:41-60`

Reset `startedRef.current = false` in cleanup.

### Task 1.7: Client: `clientMessageId` optimistic insert + ACK-aware `useSendMessage`

**Files:** `apps/web/src/features/chat/hooks.ts:68-95`, `apps/web/src/lib/socket.ts`

`onMutate` inserts optimistic message with `status: 'sending'`. `onNew` from socket replaces by `clientMessageId`. On error, mark `status: 'failed'` and show resend.

### Task 1.8: Client: move channels-list invalidation out of active-channel guard

**Files:** `apps/web/src/features/chat/hooks.ts:142-203`

Always patch `chatKeys.channels(wid)` regardless of `payload.channelId`.

### Task 1.9: Prisma migration: add `clientMessageId` column

**Files:** `packages/db/prisma/schema.prisma`, `packages/db/prisma/migrations/20260707_realtime_phase1/`

Add nullable `clientMessageId String` + `@@index` on `ChatMessage`. Generate migration.

### Task 1.10: Server: idempotent send via `(authorId, clientMessageId)` unique index

**Files:** schema.prisma, `chat.message.repository.ts`, `chat.message.service.ts`

Partial unique index `WHERE clientMessageId IS NOT NULL`. Service catches `P2002`, returns existing message.

### Task 1.11: Playwright 2-browser test for Phase 1

**File:** `e2e/chat-realtime.spec.ts` (new)

Cases: no duplicate on send; optimistic appears instantly; ACK replaces status; non-active channel preview updates; channels list updates in real-time; idempotent retry; author receives own message; no email in socket payload.

### Task 1.12: Phase 1 gate

`pnpm typecheck && pnpm lint && pnpm --filter ... test:unit && pnpm --filter ... test:integration && pnpm build && pnpm exec playwright test e2e/chat-realtime.spec.ts`. `git tag phase-1-realtime-reliability`.

---

## Phase 2 — Event Standardization, Room Model, Zod Socket Payloads

### Task 2.1: Create shared socket event registry

**File:** `packages/shared/src/socket-events.ts` (new)

```ts
export const SOCKET_EVENTS = {
  Connection: 'connection',
  Authenticated: 'authenticated',
  Error: 'error:emit',
  ConversationJoin: 'conversation:join',
  ConversationLeave: 'conversation:leave',
  ConversationUpdated: 'conversation:updated',
  WorkspaceJoin: 'workspace:join',
  WorkspaceLeave: 'workspace:leave',
  MessageSend: 'message:send',
  MessageNew: 'message:new',
  MessageUpdate: 'message:update',
  MessageDelete: 'message:delete',
  MessageRead: 'message:read',
  PresenceUpdate: 'presence:update',
  UserOnline: 'user:online',
  UserOffline: 'user:offline',
  TypingStart: 'typing:start',
  TypingStop: 'typing:stop',
  Ack: 'ack',
} as const;

export const SOCKET_ROOMS = {
  workspace: (wid: string) => `workspace:${wid}`,
  conversation: (cid: string) => `conversation:${cid}`,
  user: (uid: string) => `user:${uid}`,
  task: (tid: string) => `task:${tid}`,
} as const;
```

### Task 2.2: Server: Zod-validate every socket payload

**File:** `apps/api/src/modules/realtime/schemas.ts` (new), `apps/api/src/shared/lib/socket.ts`

`withValidation` wrapper. On `safeParse` failure emit `error:emit` to that socket.

### Task 2.3: Server: switch chat emit to `conversation:{channelId}` room

**Files:** `apps/api/src/modules/chat/chat.message.service.ts`, `socket.ts`

Add `conversation:join` handler. Emit chat events to `conversation:{channelId}`.

### Task 2.4: Client: `useChatRealtime` joins/leaves conversation room on switch

**Files:** `apps/web/src/features/chat/hooks.ts`

On `activeChannelId` change: `conversation:leave` then `conversation:join`.

### Task 2.5: Client: replace `invalidateQueries` with `setQueryData`

**Files:** `apps/web/src/features/chat/hooks.ts`, `apps/web/src/features/realtime/useRealtime.ts`

Add `apps/web/src/features/chat/cache.ts` with `patchChannelInList`, `appendMessageIfNew`, `replaceMessageById`, `removeMessageById`, `dedupeById`.

### Task 2.6: Server: structured `error:emit` instead of `safeEmit` swallowing

**Files:** `apps/api/src/shared/lib/socket-events.ts`, `chat.message.service.ts`

`emit` returns `Result<void, EmitError>`. Callers handle error.

### Task 2.7: Delete duplicated `chat.schema.ts` + `chat.message.schema.ts`

**Files:** delete `apps/api/src/modules/chat/chat.schema.ts`, `chat.message.schema.ts`. Switch imports to `@flow-desk/shared/chat`.

### Task 2.8: TaskChat unified via `scope=TASK`

**Files:** schema.prisma, chat.service.ts, TaskChat.tsx, new ChatPanel.tsx

`ChatChannel` gets `scope String @default("WORKSPACE")` + `taskId String?` + `@@index([taskId])`. `getOrCreateTaskChannel(wid, taskId)`.

### Task 2.9: Playwright test for Phase 2

Cases: switch conversation leaves old room; validation error events surface; no GET to channels list after socket event; TaskChat realtime.

### Task 2.10: Phase 2 gate + `git tag phase-2-events-rooms`

---

## Phase 3 — Optimistic ACK, Typing, Presence, Read Receipts

### Task 3.1: Pure-socket `message:send` (no REST POST)

**Files:** `apps/web/src/features/chat/hooks.ts`, `apps/api/src/modules/realtime/socket-handlers.ts` (new), `chat.message.service.ts`, `chat.routes.ts`

`useSendMessage` switches to `socket.emit('message:send', { ... }, ack)`. Server handler acks `{ ok, message }` or `{ ok: false, error }`. Delete `POST /channels/:id/messages` route.

### Task 3.2: `message:read` event + DB

**Files:** schema.prisma (add `ChatMessageRead` join table), migration, server, client, `MessageBubble.tsx`

`markRead(userId, channelId, upToMessageId)` writes to `ChatMessageRead`, emits `message:read`. Client updates `lastReadByUser` map. Bubble shows "Read by N".

### Task 3.3: `typing:start` / `typing:stop` events

**Files:** `socket-handlers.ts`, `ChatInput.tsx`, new `TypingIndicator.tsx`

Server broadcasts to `conversation:{channelId}` excluding sender. No DB. Auto-stop on disconnect. Client throttles 200ms.

### Task 3.4: Chat presence (per-channel viewers)

**Files:** `realtime.gateway.ts`, `useChatRealtime.ts`, channel header

Extend `presence:{wid}` Redis hash with per-channel viewer sets. Emit `presence:update`.

### Task 3.5: `conversation:updated` event (channel CRUD)

**Files:** `chat.service.ts`, `useChatRealtime.ts`

Emit on create/update/delete channel. Client patches `chatKeys.channels(wid)`.

### Task 3.6: ACK timeout + resend UX

**Files:** `useSendMessage`, `MessageBubble`

5s timeout. Mark `status: 'failed'`. Resend button.

### Task 3.7: Playwright tests for Phase 3

Cases: pure-socket send; typing appears; read receipt flips; presence count; channel CRUD appears; ACK timeout.

### Task 3.8: Phase 3 gate + `git tag phase-3-ack-typing-presence-reads`

---

## Phase 4 — Hardening

| #    | Task                                                                                       | Maps to  |
| ---- | ------------------------------------------------------------------------------------------ | -------- |
| 4.1  | `assertMembership` returns 403 (not 400)                                                   | auth     |
| 4.2  | Private channel ACL                                                                        | C10      |
| 4.3  | `onDelete: Cascade` migration                                                              | C12      |
| 4.4  | Partial unique index for active channel names                                              | C6       |
| 4.5  | Soft-delete extension consolidated to `packages/db`                                        | low      |
| 4.6  | Socket `connection` rate limit + per-event rate limits; `retryAfter = resetEpoch - nowSec` | C14, H16 |
| 4.7  | `useMoveTask` `queryKey` memoization                                                       | H17      |
| 4.8  | `refetchOnWindowFocus: true` for chat                                                      | H25      |
| 4.9  | Cleanup pub/sub clients + sweeper on shutdown                                              | C7, C9   |
| 4.10 | JWT refresh hook on socket                                                                 | H24      |
| 4.11 | `getSocket` replaces stuck-reconnect sockets                                               | H26      |
| 4.12 | Member cache invalidation on role change                                                   | M12      |
| 4.13 | `LLM_API_KEY` required (no placeholder)                                                    | low      |
| 4.14 | JWT TTL validation                                                                         | low      |
| 4.15 | Cluster hash-tag in rate-limit Lua                                                         | low      |

### Task 4.16: Phase 4 gate + `git tag phase-4-hardening`. `pnpm verify` end-to-end.

---

## End of session

- [ ] Update `claude-progress.md` with session record
- [ ] Update `feature_list.json` — mark feature complete
- [ ] Commit `chore(docs): realtime refactor session record`

## Risk register

| Risk                                                 | Mitigation                                                             |
| ---------------------------------------------------- | ---------------------------------------------------------------------- |
| Hot-reload during long session loses dev state       | Re-run `pnpm --filter ... dev` at phase boundaries                     |
| 4-phase scope exceeds context                        | Each phase shippable independently                                     |
| Prisma migration breaks seed                         | seed.ts has chat deleteMany; verify after migration                    |
| `safeEmit → typed emit` changes observable behavior  | callers handle Result explicitly                                       |
| Soft-delete consolidation exposes deleted rows       | softDeleteExtension already has findUnique override; add unit test     |
| Rate limit cluster hash-tag breaks single-node Redis | Lua key pattern `{rl}:user:{userId}` ignored as literal in single-node |
| TaskChat scope migration touches existing channels   | `scope` defaults `'WORKSPACE'`; existing rows unchanged                |
