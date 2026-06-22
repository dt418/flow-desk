# ADR-001: Monorepo Structure

## Context

FlowDesk is a fullstack application with frontend (React) and backend (Hono) that share domain types and Zod validation schemas. We need to choose a project structure that enables type sharing while keeping apps deployable independently.

## Decision

**pnpm workspaces + Turbo monorepo** with three packages:

```
flow-desk/
├── apps/
│   ├── web/              # React 18 + Vite
│   └── api/              # Hono + Node.js
└── packages/
    └── shared/           # Zod schemas + TypeScript types
```

## Rationale

- **Shared package** — Single source of truth for domain types and validation. Frontend imports `@flow-desk/shared/zod/task`; backend imports the same. No drift between client/server schemas.
- **Turbo** — Caches builds across packages. `turbo run build` only rebuilds packages that changed. CI parallelism out of the box.
- **pnpm** — Hard links save disk; strict dependency resolution prevents phantom dependencies.
- **Independent deploy** — apps/web builds to static bundle; apps/api builds to Node bundle. Each can be deployed to different infrastructure.

## Alternatives Rejected

| Alternative                           | Why Rejected                                                          |
| ------------------------------------- | --------------------------------------------------------------------- |
| **Single package (web + api in one)** | Cannot scale/deploy independently; type sharing becomes implicit      |
| **Two separate repos**                | Cross-repo type sharing requires publishing package to npm or git tag |
| **NPM workspaces**                    | Slower installs, weaker dependency resolution                         |
| **Yarn workspaces (classic)**         | No zero-installs; weaker than pnpm                                    |
| **Nx**                                | Heavier than Turbo; overkill for 3-package repo                       |
| **Lerna**                             | Maintenance concerns; Turbo is more focused                           |

## Consequences

- **Positive**: Type safety end-to-end; cached builds; parallel CI
- **Negative**: More tooling to learn; cross-package imports need package name; Turbo config adds cognitive overhead

## Compliance

- All cross-package imports go through `@flow-desk/shared`
- No direct imports between `apps/web` and `apps/api`
