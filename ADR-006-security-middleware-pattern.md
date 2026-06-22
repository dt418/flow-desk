# ADR-006: Security Middleware Pattern

**Date:** 2026-06-22
**Status:** Accepted
**Session:** 009 (F1 security track)

## Context

Pre-F1 baseline had five P0/P1 security gaps: no rate limiting, zero Socket.IO emissions, attachment IDOR, missing membership checks on AI/comment/attachment, and bcrypt cost 12 (250ms/hash = CPU-bound DoS surface). Plus LLM provider had no timeout/retry and `LLMError` bypassed the central handler (returned 500 instead of 502).

Three cross-cutting needs emerged:

1. **Rate limiting must compose** — auth routes need strict per-IP limits, AI routes per-user limits, all writes a broad per-user limit. Three scopes, one mechanism.
2. **Realtime must broadcast AFTER successful DB writes** — clients shouldn't see events for rolled-back transactions.
3. **Membership checks are shared** — five different mutation paths all need the same `WorkspaceMember` lookup. Duplicating means one drifts out of sync.

## Decision

### 1. Rate-limit middleware (`apps/api/src/shared/middleware/rate-limit.ts`)

Redis `INCR` + `EXPIRE` fixed-window counter. Key format: `rl:${scope}:${ipOrUserId}:${floor(now/windowSec)}`. Returns Hono `MiddlewareHandler` that:

- Reads `X-Forwarded-For` for IP when `keyBy: 'ip'`, `auth.user.id` when `keyBy: 'user'`
- On first hit in window: `INCR` returns 1, set `EXPIRE windowSec`
- On subsequent hits: `INCR` returns count, skip EXPIRE
- Sets `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` on every response
- Throws `RateLimitError(429, retryAfter)` when count > max

Scopes:

- `auth:register` 3/h/ip
- `auth:login` 5/min/ip
- `auth:refresh` 30/min/ip
- `ai:suggest` 5/min/user (covers both AI endpoints)
- `write` 60/min/user on all `/api/*` POST/PATCH/PUT/DELETE

`NODE_ENV=test` or `SKIP_RATE_LIMIT=1` short-circuits to `next()`.

### 2. Socket-events singleton (`apps/api/src/shared/lib/socket-events.ts`)

Singleton with `setIo(io)` called from `index.ts` after `createSocketServer`. Lazy `requireIo()` throws if io is unset, caught by local `safeEmit` wrappers in each route so test envs without a running socket server don't crash requests.

Helpers:

- `emitToRoom(ns, room, event, payload)` — generic
- `emitToNamespace(ns, event, payload)` — broadcast
- `emitToUser(userId, event, payload)` — room `user:{id}` on `/notifications`
- `emitToWorkspace(workspaceId, event, payload)` — room `workspace:{id}` on `/tasks`
- `emitToTask(taskId, event, payload)` — room `task:{id}` on `/tasks`

`FlowDeskNamespace = '/tasks' | '/notifications' | '/collab'`.

Emit call placement: AFTER `prisma.<mutation>` returns successfully. Never inside the prisma call. Never in a `$transaction` callback that might roll back. This guarantees no false-positive broadcasts.

### 3. `assertMembership` (`apps/api/src/shared/lib/access.ts`)

Single helper: `assertMembership(workspaceId: string, userId: string): Promise<void>`. Throws `BadRequestError` (401) if no `WorkspaceMember` row exists. Called as first DB action in every mutation route — before any lookup, before any data access.

Routes that call it:

- `attachment.routes.ts`: POST `/`, GET `/?taskId=`, GET `/:id/download`
- `task.routes.ts`: POST `/`, PATCH `/:id`, DELETE `/:id`, POST `/:id/move`, POST `/:id/subtasks`, POST `/dependencies`
- `comment.routes.ts`: POST `/`, PATCH `/:id`, DELETE `/:id` (via task lookup first)
- `ai.routes.ts`: POST `/suggest-assignee`, POST `/auto-schedule`

### 4. Error-handler widening

Status cast: `400 | 401 | 403 | 404 | 409 | 429 | 502 | 503`. `Retry-After` header set when `err.status === 429` and `details.retryAfter` is a number. `LLMError extends AppError(502, message, 'LLM_UPSTREAM', details)` flows through the same handler as every other typed error — no `try/catch` in route files.

## Consequences

Positive:

- One rate-limit implementation, three scopes (auth strict / AI per-user / write broad) — no copy-paste.
- Membership check is a single function — change it once, all five routes update.
- Socket emits guaranteed consistent: same `safeEmit` wrapper in every mutation route.
- LLM upstream errors are now distinguishable from app errors (502 vs 500).
- Existing cost-12 bcrypt hashes still match because `bcrypt.compare` reads cost from the stored hash (no migration needed for downgrading).

Negative / known limits:

- Rate limit is fixed-window, not sliding — bursty traffic at window boundary can briefly exceed max (2× in worst case). Acceptable for brute-force defense; switch to sliding-log or token-bucket if we need stricter limits.
- `safeEmit` swallows `requireIo()` failure → tests don't crash, but a missing `setIo(io)` in production would silently break realtime. Add a startup assertion in a future hardening pass.
- `assertMembership` does one extra DB round-trip per mutation (the membership lookup). Cache the membership in JWT or session to eliminate this if it becomes a hot path.

## Alternatives Rejected

- **Express-rate-limit** — wrong framework (Hono).
- **Sliding-window via Redis sorted set** — more accurate but 5× Redis ops per check; not worth the cost for brute-force defense.
- **Move realtime to a separate worker process** — would decouple DB writes from socket emissions but adds a service-to-service message broker. The `safeEmit` + post-write pattern is simpler and good enough.
- **Middleware-level membership check** — tried in spike; can't be middleware because the route handler knows which workspaceId/taskId to check (path param vs body field). Helper function is the right shape.
- **Keep `LLMError` as plain class extending `Error`** — leaks through error handler as 500. Fixed by making it `extends AppError(502, ...)` so it joins the unified error envelope.