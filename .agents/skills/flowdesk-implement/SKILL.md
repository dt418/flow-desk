---
name: flowdesk-implement
description: >
  Implement FlowDesk API/web modules with AGENTS.md architecture: Hono
  routes/service/repository/schema, React feature folders, TanStack Query,
  Prisma soft-delete, schema hygiene (no board/epic/sprint invent). Use when
  writing feature code, adding a module, fixing module layout, or fd-implementer
  is active. Do not use for pure docs, pure security review, or product planning
  (use plan-feature / flowdesk-team instead).
metadata:
  author: flow-desk
  version: '1.0'
---

# FlowDesk implement

Patterns for correct module layout. **Why:** mixed route/business logic and invented schema fields are the main sources of rewrite debt in this monorepo.

## When to load references

- Full layout + schema hygiene checklist → [references/module-layout.md](references/module-layout.md)

## Backend (Hono)

```
apps/api/src/modules/{feature}/
  {feature}.routes.ts      # HTTP only — validate, call service, map errors
  {feature}.service.ts     # business logic
  {feature}.repository.ts  # Prisma only
  {feature}.schema.ts      # Zod I/O
  {feature}.types.ts       # optional TS types
  {feature}.test.ts        # unit + integration as needed
```

Rules:

- Auth middleware on protected routes; never inline JWT parse in handlers.
- Soft delete via `deletedAt` where model supports it.
- List filters are parameters (`workspaceId`, filters), not hardcoded SQL scopes named for a future Board.

## Frontend (React)

```
apps/web/src/features/{feature}/
  components/  hooks/  api.ts  types.ts  index.ts
apps/web/src/pages/   # thin route shells only
```

- Server state via TanStack Query — no ad-hoc `useEffect` fetch for API data.
- Types from shared/Zod where contracts are shared.

## Schema hygiene (this phase)

| Do                                       | Don't                                          |
| ---------------------------------------- | ---------------------------------------------- |
| `columnId`, `parentTaskId` for structure | `boardId`, `epicId`, `sprintId` until UI ships |
| workspace-scoped query names             | `*Board*` in query/repo names                  |
| additive migrations                      | drop columns in one migration                  |

## Tests

- API: unit for pure logic; integration for HTTP + DB contracts.
- Web UI change → component test (F8) when behavior is user-visible.
- Before ship: orchestrator/fd-qa runs `pnpm verify`.

## Anti-patterns

- `any` in TypeScript
- `console.log` in non-test source (use logger)
- Secrets in frontend env bundle
- Second concurrent `in_progress` feature

---
