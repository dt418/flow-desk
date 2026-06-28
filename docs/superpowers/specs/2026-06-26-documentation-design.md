# FlowDesk User + Developer Documentation — Design

## Goal

Add three flat Markdown docs so users running FlowDesk and new engineers joining the team can find what they need without mining session logs, `feature_list.json`, `claude-progress.md`, or the source tree. No source code changes, no new tooling.

## Scope

Three new files plus a small `README.md` pointer update. Nothing else.

| File                   | Audience  | Purpose                                                    |
| ---------------------- | --------- | ---------------------------------------------------------- |
| `docs/USER.md`         | End users | First-run, every UI feature, troubleshooting               |
| `docs/DEV.md`          | New devs  | Day-0 → first merged PR                                    |
| `docs/ARCHITECTURE.md` | All devs  | Read once before editing modules                           |
| `README.md`            | Everyone  | Existing "Repo layout" section gets three new doc pointers |

The three top-level root Markdown files (`PRD.md`, `AGENTS.md`, `RISKS.md`, `TASKS.md`, `ACCEPTANCE.md`, `ADR-*`, `CHANGELOG.md`, `claude-progress.md`, `feature_list.json`, `session-handoff.md`) stay unchanged. The new docs reference them; they do not replace them.

## Layout decision

Flat three-file layout under `docs/`:

```
docs/USER.md
docs/DEV.md
docs/ARCHITECTURE.md
README.md  (one paragraph added under "Repo layout")
```

Rejected alternatives:

- Folder structure (`docs/user/`, `docs/dev/`) — premature; only three files today.
- Single combined doc (`docs/BUILDING.md`) — does too much.

Path stays in line with current repo convention: the root already mixes `PRD.md`, `TASKS.md`, `ADR-*.md` flat alongside the working tree. Creating `docs/USER.md` matches the same idea.

## Style

- Plain Markdown. GitHub-rendered.
- Heading depth: H1 (title) → H2 (sections) → H3 (subsections only). No deeper.
- Code blocks for commands, code, file paths.
- One Mermaid diagram minimum in `ARCHITECTURE.md` for the system overview. More if they clarify in either `DEV.md` or `ARCHITECTURE.md` (e.g. request flow, auth path, realtime namespace map).
- No images, no badges, no emojis.
- Voice: terse, factual, imperative. Mirrors `AGENTS.md`.
- Repo-relative cross-links (`AGENTS.md`, `ADR-006-security-middleware-pattern.md`).

## `docs/USER.md` outline

1. What is FlowDesk — one paragraph (link `PRD.md` for goals).
2. Concepts: Workspace · Board · Task · Label · Comment · Attachment · Mention · Notification · Dependency · Member.
3. Quick start (`docker compose up`, default URL, login `demo@flow-desk.app / demo1234`).
4. Workspaces: create, switch via header switcher, invite, roles (Owner/Admin/Member/Guest).
5. Tasks: create modal, status workflow (`BACKLOG → TODO → IN_PROGRESS → IN_REVIEW → DONE / BLOCKED`), priorities, due dates, subtasks, dependencies ("A blocks B").
6. Views: Kanban drag-and-drop, List/Table.
7. Collaboration: comments, `@mention` (triggers in-app notification + email placeholder), realtime presence bar, who-is-editing indicator.
8. Labels: 8 named colors (enum), per-workspace CRUD.
9. Attachments: upload, preview (images / PDFs / docs).
10. Notifications: bell, real-time toast, deep-link to task.
11. AI features: assignment suggestion, auto-schedule (respects dependencies + capacity), natural-language task creation, meeting notes → tasks. Note: provider is OpenAI-compatible; first call can be slow (R-24).
12. Settings: profile, password, workspace tabs (General / Members / Labels).
13. Troubleshooting (short): login fails, AI not responding, attachments upload stuck, can't see a workspace.

Length budget: ~600 lines.

## `docs/DEV.md` outline

1. Repo map: `apps/web`, `apps/api`, `packages/shared`, `prisma/`, `docker/`, `scripts/`. Root docs (`PRD`, `ADR-*`, `TASKS`, `ACCEPTANCE`, `RISKS`, `CHANGELOG`, `claude-progress`, `feature_list`, `session-handoff`).
2. Stack one-liner; deep dive in `ARCHITECTURE.md`.
3. Setup: `./init.sh`, `docker compose up -d`, `pnpm db:seed`, login.
4. Daily dev loop: hot-reload mode (`pnpm stack:dev-build && pnpm stack:dev`), bind-mount scopes, watch chain (`@flow-desk/shared` → `tsup --watch` → api `tsx watch` restart).
5. Tiered architecture (BE): `routes → service → repository → prisma`. Each layer one job, contract in one line. (Why three layers? cross-link `ADR-006` and Golden Rule in `AGENTS.md`.)
6. Frontend feature pattern: `apps/web/src/features/{feature}/{components,hooks,api.ts,types.ts,index.ts}`. Public surface is `index.ts`.
7. Conventions: Zod everywhere, soft-delete (`deletedAt` filter), Redis cache + TTL + invalidation path, `assertMembership` middleware, cursor-pagination envelope `{ data, nextCursor }`, structured logger with `requestId`/`userId`/`duration`.
8. Realtime: namespaces `/tasks`, `/notifications`, `/collab`; auth on `connection`; rooms by resource; presence gateway on `/tasks` (see `ARCHITECTURE.md`).
9. Database: Prisma 7, custom output `apps/api/generated/prisma/` (gitignored), `PrismaPg` adapter. `pnpm db:*` modes (docker/local) and `FLOW_DESK_DB_MODE` env.
10. Testing: BE integration Vitest (`apps/api/tests/integration/*.test.ts`), Playwright E2E (`e2e/*`), web `pnpm --filter @flow-desk/web build`.
11. Hooks: pre-commit (secret scan + per-package tsc), pre-push (full tsc + BE tests + web build). Offline: `pnpm verify`. `pnpm check:secrets` standalone.
12. Workflow:
    - Pick next unfinished highest-priority item from `feature_list.json`.
    - Set `in_progress` (only one at a time).
    - Update `claude-progress.md` at end of session.
    - Conventional Commit message.
13. Common pitfalls:
    - `.env` keys leaking into chat / commits — rotation required if exposed.
    - Container hostname is `postgres:5432`, host-side `localhost:5432`.
    - `apps/api/generated/` is gitignored — clean up on checkout issues.
    - `pnpm dev:local` requires local Postgres + Redis bound to `localhost`, not `postgres`.
    - Left-over feature branches → `pnpm` prune stale symlinks.

Length budget: ~500 lines.

## `docs/ARCHITECTURE.md` outline

1. System diagram (mermaid): web ↔ api ↔ postgres / redis / socket.io broadcast back.
2. Backend module anatomy (with real paths):
   - `apps/api/src/modules/{feature}/{feature}.routes.ts`
   - `apps/api/src/modules/{feature}/{feature}.service.ts`
   - `apps/api/src/modules/{feature}/{feature}.repository.ts`
   - `apps/api/src/modules/{feature}/{feature}.schema.ts`
   - Criterion: routes only HTTP wiring, services own logic, repos only Prisma, schema only Zod.
3. Frontend feature anatomy (`apps/web/src/features/{feature}/...`).
4. End-to-end flows (chosen to touch every subsystem):
   - Login: client → `/api/auth/login` → bcrypt → JWT cookie → home redirect.
   - Task create: client modal → `POST /api/tasks` → zValidator → service → repo → `prisma.$transaction` → Postgres → service emits `task:created` on `/tasks` namespace.
   - Drag task across columns: client → `PATCH /api/tasks/:id {status}` → service → repo → emit `task:moved`.
   - `@mention`: comment create + token scan → notification upsert + `/notifications` emit.
   - AI assignment suggestion: client → `POST /api/ai/assign-suggestions` → service loads workload (`prisma` aggregate) → `llm-provider.ts` call → return ranked list. Caller applies via `PATCH /api/tasks/:id`.
5. Auth + security (cross-link `ADR-003`, `ADR-006`):
   - JWT in httpOnly cookie, `SameSite=Lax`.
   - bcrypt cost 10.
   - `assertMembership(workspaceId, userId)` on every workspace-scoped mutation; cross-workspace → 401.
   - Rate-limit table (auth, AI, `/api/*` writes) with Redis sliding window.
   - Socket auth: middleware on `connection` reads `auth.token` from the cookie / handshake.
6. Realtime (cross-link `ADR-004`):
   - Namespace → rooms pattern (mermaid diagram).
   - Presence: `presence:{wid}` Redis hash, 30s TTL, 10s sweeper.
   - Client reconnection: exponential backoff 1s → 30s, randomization 0.5, timeout 20s.
7. Data model snapshot: User, Workspace, Membership, Task, TaskSubtask, TaskDependency, TaskLabel, TaskLabelAssignment, Comment, Attachment, Notification. Each has `id`/`createdAt`/`updatedAt`/`deletedAt?`.
8. Caching: per-resource Redis key conventions + TTL + invalidation source-of-truth (the module that mutates).
9. AI layer: `apps/api/src/shared/lib/llm-provider.ts`, baseUrl + model from env, 30s `AbortController`, 1 retry on 5xx, `LLMError → 502 LLM_UPSTREAM`.
10. Build / deploy: single `docker compose up`, healthcheck at `/api/health`, seed via `pnpm db:seed`.
11. Risks / sharp edges: R-24 (LLM latency UX), custom Prisma output, PrismaPg + seed ESM/CJS interop, Node 22-only.
12. Cross-refs: `AGENTS.md`, every `ADR-*`, `RISKS.md`, `CHANGELOG.md`.

Mermaid diagram count: at least one system overview + one for realtime namespace/rooms structure.

Length budget: ~500 lines.

## README.md update

Under the existing `## Repo layout` block, add:

```
docs/USER.md        # End-user guide (features + how-to)
docs/DEV.md         # Developer onboarding
docs/ARCHITECTURE.md # Architecture deep-dive
```

Nothing else changes in `README.md`.

## Out of scope

- No source code, no diagram tooling, no renderer.
- No migration of existing `PRD.md` / `ADR-*` into the new docs (keep both — different jobs).
- No screenshots or images (GitHub-renders text well, images add weight).
- No new CI / lint / build step for the docs.
- No translation, no FAQ per-feature; later if needed.
- No `CONTRIBUTING.md` extraction from `AGENTS.md` (different document, separate spec).

## Definition of done

- Three files exist at the agreed paths, each cross-links correctly.
- `README.md` has the three new pointers under "Repo layout".
- No source code or runtime config changed.
- All cross-links in the new docs resolve to existing files (`pnpm check:links` grep equivalent — manual verification step).
- `pnpm --filter @flow-desk/web build` still passes (no touched source, but sanity).
- Lint-clean markdown (no trailing whitespace, headings start at H1, no skipped heading levels).

## Verification

- Read each new doc top to bottom; confirm links resolve.
- Skim consistency with `AGENTS.md` voice (terse, factual).
- Confirm terminology matches `PRD.md` and current `feature_list.json` (soft-delete, cursor pagination, presence).
- Confirm no drift vs `README.md` "Tech stack" + "Repo layout" sections.
