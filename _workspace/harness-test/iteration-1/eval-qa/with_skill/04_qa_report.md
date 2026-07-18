# QA Report — flowdesk-qa skill smoke (Phase A)

| Field        | Value                                                                 |
| ------------ | --------------------------------------------------------------------- |
| Skill        | `flowdesk-qa` (`.agents/skills/flowdesk-qa/SKILL.md`)                 |
| Agent        | `fd-qa` (`.claude/agents/fd-qa.md`)                                   |
| Scope        | Chat module coherence only (API ↔ web hooks/types)                    |
| Phase        | **A only** — no full `pnpm verify`                                    |
| Date         | 2026-07-18                                                            |
| Product code | Unchanged (read-only smoke)                                           |

## Boundary checks

Compared API response shapes under `apps/api/src/modules/chat/` (+ task channel route) against `apps/web/src/features/chat/` consumers and shared types in `packages/shared/src/chat.ts`.

### Primary endpoint comparison: list + send messages

| Side | Path / call | Envelope |
| ---- | ----------- | -------- |
| API  | `GET /api/workspaces/:wid/channels/:channelId/messages` → `c.json({ data, nextCursor })` | `{ data: Message[], nextCursor: string \| null }` |
| Web  | `chatApi.listMessages` → `api<{ data: ChatMessageWithAuthor[]; nextCursor: string \| null }>` | Same; `useMessages` uses `getNextPageParam: lastPage => lastPage.nextCursor` |
| API  | `POST .../messages` → `c.json({ data: message }, 201)` | `{ data: Message }` |
| Web  | `chatApi.sendMessage` typed `{ data: ChatMessageWithAuthor }` | Same envelope (send path in UI prefers socket `message:send` + ack) |

| Check | Detail | Result |
| ----- | ------ | ------ |
| List pagination wrapper | API returns `{ data, nextCursor }` (not bare array / not `{ items }`). Web infinite query reads `lastPage.nextCursor` and flattens `pages[].data`. | **PASS** |
| List item fields | Prisma message + `author { id, name, email, avatarUrl }` serializes via JSON to ISO date strings; matches `ChatMessageWithAuthor` fields used by UI (`id`, `content`, `author`, `createdAt`, …). | **PASS** |
| Send envelope | REST `{ data }` and socket ack `{ ok, message }` both consumable; optimistic path uses socket primarily. | **PASS** |
| List channels | `GET .../channels` → `{ data: channels[] }`; web `channelsQuery.data?.data`. | **PASS** |
| Create channel | POST `{ data: channel }` 201; web `data.data` + `appendChannelToList`. Body includes `workspaceId` required by shared schema. | **PASS** |
| Delete channel/message | API `{ ok: true }`; web `api<{ ok: boolean }>`. | **PASS** |
| Task channel | `POST /api/tasks/:id/task-channel` → `{ data: channel }`; `TaskChat` uses `channelData?.data` then `useMessages(wid, channel.id)`. | **PASS** |
| Routes ↔ links | NavLink `/workspaces/${w.id}/chat` ↔ `App.tsx` route `/workspaces/:workspaceId/chat` → `pages/chat.tsx`. | **PASS** |
| Error envelope | API handler `{ message, code, details, requestId }`; web `ApiError` reads `body.message`. | **PASS** |
| Socket wire names | Web listens `message:new` / `message:updated` / `message:deleted`; API emits same strings. Join uses `join-workspace` / `conversation:join` on both sides. | **PASS** |

### Soft / residual (not hard fails)

| Issue | Severity | Notes |
| ----- | -------- | ----- |
| `editedAt` schema vs DB | Residual | Shared `chatMessageViewSchema` requires `editedAt`; Prisma `ChatMessage` has no `editedAt` column. REST list/update return raw rows (field absent). Socket broadcasts synthesize `editedAt: null` or `updatedAt`. UI `message.editedAt && ' (edited)'` stays falsy on REST-loaded history → missing badge, not crash. |
| Extra `authorName` on channel `latestMessage` | Residual | API adds `authorName`; shared `ChannelWithLatest` omits it. Additive JSON is fine for untyped runtime consumers. |
| `SOCKET_EVENTS.MessageUpdate` / `MessageDelete` | Residual | Constants say `message:update` / `message:delete`; live emit/listen use `message:updated` / `message:deleted`. Runtime path uses string literals, not the wrong constants. |
| Socket ack raw Date objects | Residual | `ack({ ok: true, message })` passes Prisma entity; Socket.IO JSON encodes Dates to ISO. Coherent at runtime. |
| Channels cache type drift | Residual | `useChatRealtime` annotates channels cache with `nextCursor`; listChannels response has no `nextCursor`. Cache helpers use `{ data }` only — no runtime breakage. |

## Commands run

| Command | Result |
| ------- | ------ |
| Coherence-only smoke (static read of chat API routes/services, web `api.ts` / `hooks.ts` / types, shared chat schemas, App routes, socket handlers) | Done |
| `pnpm verify` | **Skipped** (Phase A harness smoke) |
| Package unit / integration tests | **Skipped** |

## Residual risk

1. **Full gate not run** — `pnpm verify` (format, lint, typecheck, unit, integration, build) was not executed in this smoke. Ship claim for a real feature still requires Phase B evidence.
2. **`editedAt` drift** — “(edited)” badge unreliable after REST load/edit until a socket `message:updated` with synthetic `editedAt` lands. Prefer mapper on REST responses or drop field until DB column exists.
3. **Shared socket event constant drift** — risk if future code switches to `SOCKET_EVENTS.MessageUpdate` without fixing the string.
4. **No live HTTP/socket exercise** — shapes inferred from source only.

## Verdict: SHIP

Coherence is clean for the chat list/send envelope and channel routes (pagination wrapper matches consumer; no bare-array vs `{ data }` mismatch). Zero hard boundary failures.

Residual: **full `pnpm verify` not run in smoke**.

| Metric | Count |
| ------ | ----- |
| Boundary hard fails | **0** |
| Residual notes | 4 |
| Verdict | **SHIP** |
