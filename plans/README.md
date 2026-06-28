# Plans — FlowDesk Audit 2026-06-28

Commit: `764615b`
Effort: `quick` (correctness + security focus, expanded to include perf/tests based on findings)

## Priority Order

1. [001-fix-stored-xss-task-description](001-fix-stored-xss-task-description.md) — Stored XSS via `marked` without sanitization — Status: **DONE** (merge 7f41414)
2. [002-fix-cross-workspace-idor](002-fix-cross-workspace-idor.md) — Cross-workspace IDOR: column, dependency, chat mention, AI task read — Status: **DONE** (merge 229f6bb)
3. [003-fix-refresh-token-and-oauth](003-fix-refresh-token-and-oauth.md) — Refresh token DB mismatch + OAuth unverified-email takeover — Status: TODO
4. [004-fix-websocket-idor-and-event-mismatch](004-fix-websocket-idor-and-event-mismatch.md) — WebSocket room join no authz + client/server event name mismatch — Status: TODO
5. [005-fix-soft-delete-extension](005-fix-soft-delete-extension.md) — Soft-delete extension misses `findUnique` + ChatChannel/ChatMessage — Status: TODO
6. [006-harden-jwt-secret-and-rate-limiting](006-harden-jwt-secret-and-rate-limiting.md) — JWT_SECRET default, SKIP_RATE_LIMIT, XFF spoofing, port exposure — Status: TODO
7. [007-fix-digest-emailjob-and-cursor-pagination](007-fix-digest-emailjob-and-cursor-pagination.md) — Digest EmailJob never created + listTasks cursor/sort mismatch — Status: TODO
8. [008-fix-performance-redis-shutdown-ratelimit](008-fix-performance-redis-shutdown-ratelimit.md) — Redis KEYS blocking, no graceful shutdown, rate-limit race — Status: TODO

## Dependency Graph

- 001, 002, 003, 005, 006, 007, 008 — independent (can be executed in parallel)
- 004 depends on 002 (both touch `socket.ts` membership checks; 002 establishes the `assertMembership` pattern, 004 applies it to socket handlers)

## Status Table

| Plan | Finding | Status | Executor | Verified |
|------|---------|--------|----------|----------|
| 001 | S1 | DONE | cavecrew-builder | 7f41414 |
| 002 | S3, S4, S8, S9, S18 | DONE | general | 229f6bb |
| 003 | S5, S6 | TODO | — | — |
| 004 | S7, C2 | TODO | — | — |
| 005 | C1 | TODO | — | — |
| 006 | S2, S10, S11, S16, S17 | TODO | — | — |
| 007 | C3, C4 | TODO | — | — |
| 008 | P1, P3, P5 | TODO | — | — |

## Findings Not Planned (Deferred)

The following findings were identified but not given individual plans. They should be addressed after the above plans are completed.

### Architecture Debt (Effort: L each)
- **D1**: `workspace.routes`, `auth.routes`, `board.routes` — no service/repo split (violates AGENTS.md module structure)
- **D2**: No route-level code splitting on web (React.lazy/Suspense)

### Test Coverage (Effort: L total)
- **T1**: Auth module zero tests (security-critical, 260 lines, 6 endpoints)
- **T2**: Realtime gateway zero tests (memory-leak risk, 160 lines)
- **T4/T5**: Email processor tests shallow; digest processor has no test file
- **T6**: Chat mention → email path untested + possibly not implemented
- **T7**: Socket.IO event emission untested across modules
- **T8**: E2E specs don't test real behavior (realtime, chat)

### Performance (Effort: M each)
- **P2**: Email scheduler N+1 (tasks + nested workspaces × members)
- **P4**: requireAuth + assertMembership hit DB every request, no Redis cache
- **P6**: Attachment upload buffers entire file in memory

### Tech Debt (Effort: S-M each)
- **D3**: `any` usage in production code (task.routes, scheduler, digest, notification-email)
- **D4**: Missing `@@index` on FKs (Task.createdById, UserNotificationPreference.workspaceId)
- **D5**: `emitToWorkspace` not wrapped in `safeEmit` (label, task-label services)
- **D6**: Unstructured logging (raw Hono request-line, not JSON with requestId/userId/duration)
- **D7**: API client doesn't Zod-validate responses (`return body as T`)
- **D8**: ReactQueryDevtools statically imported into prod bundle
- **D9**: Vite ships sourcemaps + no chunking strategy
- **D10**: Web lint/test scripts are placeholders (no ESLint, no test runner)
- **D11**: Path params unvalidated across many routes (no Zod on `c.req.param('id')!`)
- **D12**: Register/OAuth workspace creation not transactional
- **D13**: labelsDeprecated read-modify-write race
- **D14**: Socket reconnect creates new socket without disconnecting old
- **D15**: Duplicate Radix UI packages + shadcn CLI in runtime deps

### Security (Lower Priority)
- **S12**: OAuth state cookie missing `secure` flag + not cleared after callback
- **S13**: Email enumeration via registration (409 vs 201)
- **S14**: AI sends member emails to LLM provider (PII leak)
- **S15**: Error handler leaks LLM upstream body to client
- **S18**: Task create/subtask doesn't verify column belongs to workspace (included in plan 002)
