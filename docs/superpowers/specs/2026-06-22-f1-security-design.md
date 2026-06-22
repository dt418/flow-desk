# FlowDesk F1 Security Track — Design Spec

**Date:** 2026-06-22
**Session:** 009
**Status:** Complete — implemented, smoke-verified, merged to main (commits `1f33bcc`..`e15e85c`, docs `6aa9253`)

## Problem

FlowDesk backend is functional but has 5 known security/quality gaps that surface during bug-hunt review:

1. **No rate limiting** — auth, AI, and write endpoints fully unprotected. Brute-force on passwords, AI cost amplification, spam registrations all trivial.
2. **Zero Socket.IO emissions** — clients connect, join rooms, but server never broadcasts. Stated realtime architecture is silently absent.
3. **Attachment IDOR** — `GET /api/attachments/:id/download` has no membership check. Any auth'd user can stream any file by ID.
4. **Missing membership checks** on POST `/api/comments`, POST `/api/ai/*` — data exfiltration + spam vector.
5. **bcrypt cost 12** (250ms/hash) without rate limit = CPU-bound DoS surface.

Bonus quality fixes: LLM provider has no timeout/retry, custom `LLMError` bypasses central handler → 500 instead of 502.

## Goals

Close all 5 gaps with minimal surface change. Preserve existing API contracts. Keep zero service/repository layer intact (deferred to F4 refactor).

## Non-Goals

- New business features (NL task creation, command palette, etc.)
- Architecture refactor (service/repository/schema split) — F4
- Transactions for register/login (P1) — deferred
- Soft-delete gaps (PATCH workspace, comment lookup, etc.) — deferred
- Pagination gaps (members, attachments, board take:50) — deferred
- Bulk N+1 (dependency BFS, dashboard useQueries) — deferred

## Design

### 1. Rate Limiting — Redis Sliding Window

**Mechanism:** fixed-window counter via Redis `INCR` + `EXPIRE`. Window keyed by IP for unauthenticated routes, by `userId` for authenticated routes.

**New file:** `apps/api/src/shared/middleware/rate-limit.ts`

```
function rateLimit(opts: {
  windowSec: number;        // window size in seconds
  max: number;              // max requests per window
  keyBy: 'ip' | 'user';     // scoping
  scope: string;            // e.g. 'auth:login', used in key prefix
}): MiddlewareHandler
```

**Key format:** `rl:${scope}:${ipOrUserId}:${floor(now/windowSec)}`

**Algorithm:**
1. Compute window bucket key
2. `INCR` key → returns current count
3. If count === 1: `EXPIRE` key with `windowSec` (atomic-ish; minor race acceptable)
4. If count > max: throw `RateLimitError(retryAfterSec)` (sets `Retry-After` header)
5. Always set headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (epoch of next window start)

**Skip condition:** `env.NODE_ENV === 'test' || env.SKIP_RATE_LIMIT === '1'` (env var for prod debugging). Default: ON.

**Error class:** existing `RateLimitError` from `shared/errors/index.ts` — already 429 + `RATE_LIMITED` code. Error handler will pick it up automatically. Add `Retry-After` header support in `error-handler.ts` when status === 429.

**Wire-up points** (per-route middleware, not global):

| Route group | Scope | Limit |
|---|---|---|
| `POST /api/auth/login` | `auth:login` | 10/min/IP |
| `POST /api/auth/register` | `auth:register` | 5/min/IP |
| `POST /api/auth/refresh` | `auth:refresh` | 30/min/IP |
| All `/api/ai/*` | `ai:user` | 20/min/user |
| All write paths (`POST/PATCH/DELETE` under `/api`) | `write:user` | 60/min/user |

**Implementation:** Mount per-router via `router.use(path, middleware)` or inline at handler top. Auth routes get specific limits; AI gets its own; everything else falls under the broad write limit applied via `app.use('/api/*', method-aware)` except for routes that already declare stricter limits.

**Dep:** `apps/api/src/shared/lib/redis.ts` already exports `redis` singleton. Add `incrWithTtl(key, ttl)` helper if needed.

**Test plan:** curl loops returning 429 after threshold; verify `X-RateLimit-*` headers present; verify `Retry-After` set on 429.

### 2. Socket.IO Emissions

**Root cause:** `createSocketServer` returns `io` but caller (likely `index.ts`) doesn't store the reference. Helpers added but never invoked.

**New file:** `apps/api/src/shared/lib/socket-events.ts`

```
let _io: Server | null = null;
export function setIo(io: Server) { _io = io; }
function emit(ns: string, room: string, event: string, payload: unknown) {
  if (!_io) return; // graceful no-op if socket not yet up
  _io.of(ns).to(room).emit(event, payload);
}

// Public helpers
export function emitTaskCreated(workspaceId: string, task: TaskDto) { ... }
export function emitTaskUpdated(workspaceId: string, task: TaskDto) { ... }
export function emitTaskDeleted(workspaceId: string, taskId: string) { ... }
export function emitTaskMoved(workspaceId: string, task: TaskDto) { ... }
export function emitCommentCreated(workspaceId: string, comment: CommentDto) { ... }
export function emitNotification(userId: string, notification: NotificationDto) { ... }
```

**Wire-up:** at the END of successful handlers (after `prisma.X.create/update/delete` returns), call the matching helper. No emit on validation/auth failures.

**Mount points:**
- `task.routes.ts`: POST `/:id/move` → `emitTaskMoved`; POST `/` → `emitTaskCreated`; PATCH `/:id` → `emitTaskUpdated`; DELETE `/:id` → `emitTaskDeleted`
- `comment.routes.ts`: POST `/` → `emitCommentCreated`
- `notification.routes.ts`: any internal `prisma.notification.create` → `emitNotification` (but typically created by other modules; emit from there)

**Socket wiring:** in `socket.ts`, after `createSocketServer` returns, call `setIo(io)` once.

**Web consumption:** existing `apps/web/src/lib/socket.ts` `useSocket()` hook. Add subscription in Board page: on `task:created/updated/deleted/moved` → invalidate `['board', workspaceId]` and `['tasks', workspaceId]`. On `comment:created` → invalidate comment query. On `notification:new` → invalidate notifications list. Keep subscribe logic tight to avoid re-renders.

**Test plan:** two browser tabs on same board; move task in tab A → tab B reflects within 1s (React Query refetch on socket event). Use log assertion: `logger.info({ event, payload }, 'emitted')` for one-off debug.

### 3. Attachment IDOR + Membership Checks

**File:** `apps/api/src/modules/attachment/attachment.routes.ts`

For all 3 handlers, fetch task with workspaceId, then call `assertMembership(workspaceId, auth.user.id)` (existing helper used by task routes).

- `GET /` (`taskId` query): include `task: { select: { workspaceId: true } }` on attachment query, then assert.
- `POST /`: same — fetch task, assert membership before writeFile.
- `GET /:id/download`: include `task: { select: { workspaceId: true } }`, assert before streaming.

**Refactor:** the existing `assertMembership` helper is in `task.routes.ts` (line ~17). Extract to `apps/api/src/shared/lib/access.ts` so attachment + comment + AI routes can import it without circular deps. (Tiny refactor — single source of truth for membership.)

### 4. Membership Checks — Comments + AI

**File:** `apps/api/src/modules/comment/comment.routes.ts`
- `POST /`: after task lookup, call `assertMembership(task.workspaceId, auth.user.id)`.

**File:** `apps/api/src/modules/ai/ai.routes.ts`
- `POST /suggest-assignee`: after Zod parse, `assertMembership(body.workspaceId, auth.user.id)`.
- `POST /auto-schedule`: same.

All 3 use the same `assertMembership` helper from §3.

### 5. bcrypt 12 → 10

**Files:** `apps/api/src/modules/auth/auth.routes.ts`
- Change `bcrypt.hash(password, 12)` → `bcrypt.hash(password, 10)` (line ~43)
- Change `bcrypt.compare(password, user.password)` stays the same (compare is fine at cost 10)

**Rationale:** 100ms vs 250ms = 2.5× faster per auth op. Combined with rate limit, brute-force surface collapses. OWASP 2025 recommendation: cost ≥ 10, prefer argon2id for new systems (argon2 migration deferred — too big for this track).

### Bonus: LLM Provider Hardening

**File:** `apps/api/src/shared/lib/llm-provider.ts` + `shared/errors/index.ts`

1. **Class change:** make `LLMError extends AppError` with `status = 502` and `code = 'LLM_UPSTREAM'`. Error handler at `apps/api/src/shared/middleware/error-handler.ts` casts status to a fixed union `400 | 401 | 403 | 404 | 409 | 429`. Implementation must widen this cast to include `502` (and `503` for future-proofing) — exact list: `400 | 401 | 403 | 404 | 409 | 429 | 502 | 503`. Any status outside this union falls into the 500 default; widening is required so LLM_UPSTREAM returns 502 not 500.
2. **Timeout:** wrap `fetch` call with `AbortController` and `setTimeout(() => ctrl.abort(), 30_000)`. Clear timeout in `finally`.
3. **Retry:** wrap the whole thing in a small retry loop: 1 retry on 5xx OR AbortError, with 500ms backoff. Throw `LLMError` after exhausted.

**Test plan:** stub fetch to throw `AbortError` → verify retry → verify final throw after 2 attempts. Stub fetch to return 500 → verify retry → final throw.

## File Touch List

| File | Action | Lines est. |
|---|---|---|
| `apps/api/src/shared/middleware/rate-limit.ts` | NEW | ~70 |
| `apps/api/src/shared/middleware/error-handler.ts` | EDIT (add `Retry-After` for 429) | +5 |
| `apps/api/src/shared/lib/socket.ts` | EDIT (call `setIo(io)`) | +2 |
| `apps/api/src/shared/lib/socket-events.ts` | NEW | ~60 |
| `apps/api/src/shared/lib/access.ts` | NEW (extract assertMembership) | ~15 |
| `apps/api/src/modules/auth/auth.routes.ts` | EDIT (bcrypt 10 + rate limits) | +15/-5 |
| `apps/api/src/modules/attachment/attachment.routes.ts` | EDIT (assertMembership × 3) | +10 |
| `apps/api/src/modules/comment/comment.routes.ts` | EDIT (assertMembership + emit) | +5 |
| `apps/api/src/modules/task/task.routes.ts` | EDIT (emit × 4) | +8 |
| `apps/api/src/modules/ai/ai.routes.ts` | EDIT (assertMembership × 2 + rate limit) | +10 |
| `apps/api/src/shared/lib/llm-provider.ts` | EDIT (timeout + retry + AppError) | +20/-5 |
| `apps/api/src/shared/errors/index.ts` | EDIT (LLMError extends AppError) | +3 |
| `apps/api/src/index.ts` | EDIT (rate-limit middleware mount) | +10 |
| `apps/web/src/lib/socket.ts` | EDIT (subscriptions for events) | +20 |
| `apps/web/src/pages/board.tsx` | EDIT (invalidate on socket event) | +10 |

Total: ~10 new lines × 3 new files + ~120 line edits across 11 files.

## Verification

**Per-feature evidence in feature_list.json** (`security-001` rate limit, `security-002` socket, `security-003` idor, `security-004` membership, `security-005` bcrypt+llm):

1. **Build:** `pnpm --filter @flow-desk/shared build && pnpm --filter @flow-desk/api typecheck && pnpm --filter @flow-desk/web typecheck && pnpm --filter @flow-desk/web build` — green.
2. **API smoke (cookies):**
   - `POST /api/auth/login` × 11 with bad creds → first 10 → 401, 11th → 429 with `Retry-After`
   - `POST /api/ai/suggest-assignee` × 21 → first 20 → 200, 21st → 429
   - Auth as alice, `GET /api/attachments/<file-from-bob-workspace>` → 403 (IDOR closed)
   - Auth as alice, `POST /api/comments` with `taskId` from bob's workspace → 403
   - Auth as alice, `POST /api/ai/auto-schedule` with `workspaceId` from bob's workspace → 403
3. **Socket smoke:** two browser tabs open on same `/board/:id`; in tab A move a task → in tab B card snaps to new column within 1s (no manual refresh).
4. **LLM smoke:** stub fetch to delay 31s → verify 502 `LLM_UPSTREAM` (not 500). Stub fetch to 500 → verify 2 attempts then 502.
5. **No regression:** all 22 features in `feature_list.json` still pass (run a curl smoke for each).

## Risks

- **R-25** Rate-limit false positives in tests → mitigated via `env.SKIP_RATE_LIMIT`.
- **R-26** Socket emit on rolled-back transactions (emit fired before tx commits) → mitigated by emit-at-end-of-handler pattern; tx already commits before handler returns.
- **R-27** `assertMembership` extraction might break if other modules import the old location → mitigated by grep + update all call sites atomically.
- **R-28** LLM retry doubles provider load → 1 retry only; timeout 30s caps max latency; provider already slow (~25s).
- **R-29** bcrypt 10 vs existing hashes at cost 12 → `bcrypt.compare` works regardless of stored cost, no migration needed.

## Out of Scope (for next session)

- Transactions on register/login/google-callback
- Soft-delete gaps (4 handlers)
- Pagination (4 endpoints)
- Service/repository/schema refactor (F4)
- Bulk N+1 fixes
- Argon2id migration