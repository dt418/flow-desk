# Layout audit — `apps/api/src/modules/chat/`

**Skill:** `flowdesk-implement` + `references/module-layout.md`  
**Scope:** API chat module only (channels + messages). Product source not modified.  
**Date:** 2026-07-18

## File inventory

| Expected (skill template) | Present | Path                                                                                                                      |
| ------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------- |
| `{feature}.routes.ts`     | PASS    | `chat.routes.ts`, `chat.message.routes.ts`                                                                                |
| `{feature}.service.ts`    | PASS    | `chat.service.ts`, `chat.message.service.ts`                                                                              |
| `{feature}.repository.ts` | PASS    | `chat.repository.ts`, `chat.message.repository.ts`                                                                        |
| `{feature}.schema.ts`     | PASS\*  | Schemas live in `packages/shared/src/chat.ts` (`@flow-desk/shared/chat`) — shared contract pattern, not module-local file |
| `{feature}.types.ts`      | N/A     | Optional; types inferred from shared Zod                                                                                  |
| `{feature}.test.ts`       | PASS    | `chat.test.ts`, `chat.message.test.ts` + `apps/api/tests/integration/chat.service.test.ts`                                |

\*Count as pass for monorepo shared-schema convention; fail only if no Zod at all.

## Checklist (skill + module-layout)

| #   | Rule                                                                 | Result           | Evidence                                                                                                                                                                                                    |
| --- | -------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Routes registered in app router                                      | **PASS**         | `apps/api/src/app.ts:107-108` mounts `chatRouter` and `chatMessageRouter` under `/api/workspaces/:wid/channels…`                                                                                            |
| 2   | Zod parse body/query/params at route edge                            | **PASS**         | `chat.routes.ts` / `chat.message.routes.ts` use `zValidator` + `safeParse` with schemas from `@flow-desk/shared/chat`                                                                                       |
| 3   | Service throws typed errors; centralized handler maps status         | **PASS**         | Services/repos throw `NotFoundError`, `ForbiddenError`, `ConflictError`, `BadRequestError` from `shared/errors`; routes rethrow via `onError`                                                               |
| 4   | Repository never imports HTTP types                                  | **PASS**         | Repos take Prisma client + domain args only; no Hono `Context` / `c`                                                                                                                                        |
| 5   | Auth middleware on protected routes; no inline JWT parse             | **PASS**         | `requireAuth()` on both routers (`chat.routes.ts:14`, `chat.message.routes.ts:15`)                                                                                                                          |
| 6   | Business logic in service (not routes)                               | **PARTIAL FAIL** | Most logic is in services. **Exceptions:** (a) `chat.message.routes.ts` POST handler builds payload and `emitToRoom` for `message:new` (side-effect/broadcast in route); (b) channel routes are thin and OK |
| 7   | Repository is Prisma-only (no business / authz)                      | **FAIL**         | `chat.repository.ts:31-48` `findAndValidateChannel` performs access control (`workspaceMember` + `ForbiddenError`). Membership is product rules, not pure data access                                       |
| 8   | Soft delete via `deletedAt` where model supports it                  | **PASS**         | Channel soft-delete `chat.repository.ts:160-161`; message soft-delete in message repo; queries filter `deletedAt: null`                                                                                     |
| 9   | List filters parameterized (`workspaceId`, filters), not board-named | **PASS**         | Workspace-scoped names (`findByWorkspace`, channel by `workspaceId`); no `*Board*` in chat module                                                                                                           |
| 10  | No invented board/epic/sprint schema in this module                  | **PASS**         | Chat uses `workspaceId` / channel / message only                                                                                                                                                            |
| 11  | Indexes / relations (schema hygiene note)                            | **N/A (module)** | Prisma models outside this folder; not re-audited here                                                                                                                                                      |
| 12  | Service owns orchestration; repo not skipped carelessly              | **PARTIAL FAIL** | `chat.message.service.ts` `listMessages` and parts of `markRead` call `prisma.chatMessage*` / `chatMessageRead` directly instead of always going through `chat.message.repository`                          |
| 13  | Tests: unit + integration for contracts                              | **PASS**         | Unit under module; integration `chat.service.test.ts`; IDOR mention coverage in `idor-cross-workspace.test.ts`                                                                                              |

## Pass/fail summary

| Rule group                                       | Status                                                  |
| ------------------------------------------------ | ------------------------------------------------------- |
| routes / service / repository / schema present   | **PASS** (schema shared)                                |
| Register routes                                  | **PASS**                                                |
| Zod at edge                                      | **PASS**                                                |
| Typed errors                                     | **PASS**                                                |
| Repo no HTTP types                               | **PASS**                                                |
| Auth middleware                                  | **PASS**                                                |
| Business logic in service                        | **PARTIAL FAIL** (socket emit on message POST in route) |
| Repo Prisma-only (no authz)                      | **FAIL** (`findAndValidateChannel` membership)          |
| Soft delete / workspace naming / no board invent | **PASS**                                                |
| Related tests present                            | **PASS**                                                |

**Overall:** Layout is **mostly compliant**. Primary debt: membership enforcement living in the repository, plus a small amount of broadcast/orchestration in `chat.message.routes` and direct Prisma in message service.

## Suggested fixes (notes only — not applied)

1. Move membership check out of `findAndValidateChannel` into service (or call `assertMembership` then a pure `findChannel` in repo). Align error type with `assertMembership` if product wants one status code.
2. Move `message:new` emit from route into service or a thin collab helper already used by socket path (service comment currently says broadcast is caller's responsibility — document that as an intentional exception or unify).
3. Route `listMessages` / `markRead` DB access through `chat.message.repository` for consistency.
