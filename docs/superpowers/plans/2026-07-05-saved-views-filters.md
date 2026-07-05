# Saved Views / Filters (P1-2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add saved views / filters — per-user named filter presets on the task list page, optionally shared with workspace members, persisted via a `SavedFilter` model and CRUD at `/api/workspaces/:id/saved-filters`.

**Architecture:** New `SavedFilter` Prisma model (id, userId, workspaceId, name, query Json, isShared Boolean, soft-delete). New `saved-filter` API module (routes/service/repository split per AGENTS.md) mounted at `/api/workspaces/:wid/saved-filters` (mirrors the label module pattern). `query` JSON shape = `{ status?, priority?, assigneeId?, sortBy?, sortOrder? }` matching the existing `listTasksQuerySchema` filter fields (no pagination — saved views are filter sets, not page states). Web feature module + save-current-filter button + load dropdown + manage dialog wired into the list page. `isShared` filters visible to all workspace members; edit/delete owner-only.

**Tech Stack:** PostgreSQL 16 + Prisma 7.8, Hono + Zod, TanStack Query, shadcn Dialog/DropdownMenu (already installed).

## Global Constraints

- Schema hygiene checklist (AGENTS.md §Future-Sprint Schema Hygiene): no `board` in names; no new structural fields on `Task`; query functions take `workspaceId`/`userId` as parameters. `SavedFilter` is a user-scoped preset, not a structural task field — does NOT touch `Task`.
- Module layout per AGENTS.md: `apps/api/src/modules/saved-filter/{saved-filter.routes,saved-filter.service,saved-filter.repository,saved-filter.test,index}.ts`; Zod schemas in `packages/shared/src/saved-filter.ts`; web feature at `apps/web/src/features/saved-filter/`.
- One feature `in_progress` in `feature_list.json` at a time.
- `SavedFilter` model: `id` (cuid), `createdAt`, `updatedAt`, `deletedAt?` (soft delete) — per AGENTS.md Prisma rules. `@@index([workspaceId, userId])` per ROADMAP. `@@unique([workspaceId, userId, name])` — one name per user per workspace (prevents duplicate preset names; isShared filters still keyed by owner).
- `isShared` visibility: members see shared filters in the load dropdown; edit/delete owner-only (enforced in service + routes via `ownerId` check).
- Soft-delete: `SavedFilter.deletedAt` is covered by the existing `softDeleteExtension` (`apps/api/src/shared/lib/prisma-extension.ts`) — no manual `deletedAt: null` filter needed in repository queries (unlike search's raw SQL). Verify the extension covers `SavedFilter` by adding it to the `SOFT_DELETE_MODELS` set in Task 1.
- Web test ships with the feature (F8 pattern: `apps/web/src/components/ui/workspace-create-dialog.test.tsx` is the template).
- Raw SQL NOT used — standard Prisma client queries throughout. No `softDeleteExtension` bypass.

---

## File Structure

**Backend (apps/api):**

- `packages/db/prisma/migrations/<timestamp>_saved_filter/migration.sql` — Create: `SavedFilter` table + indexes + unique constraint.
- `packages/db/prisma/schema.prisma` — Modify: add `SavedFilter` model + relation on `User` and `Workspace`.
- `apps/api/src/shared/lib/prisma-extension.ts` — Modify: add `'SavedFilter'` to `SOFT_DELETE_MODELS`.
- `apps/api/src/modules/saved-filter/saved-filter.repository.ts` — Create: Prisma queries (list, create, update, delete, findOwned).
- `apps/api/src/modules/saved-filter/saved-filter.service.ts` — Create: membership check, ownership check, isShared visibility logic.
- `apps/api/src/modules/saved-filter/saved-filter.routes.ts` — Create: `GET/POST/PATCH/DELETE /api/workspaces/:wid/saved-filters` with `requireAuth` + `requireWorkspaceRole(MEMBER+)`.
- `apps/api/src/modules/saved-filter/saved-filter.test.ts` — Create: unit tests for service (ownership/isShared logic).
- `apps/api/src/modules/saved-filter/index.ts` — Create: public exports.
- `apps/api/src/app.ts` — Modify: register `savedFilterRouter` at `/api/workspaces/:wid/saved-filters`.
- `apps/api/tests/integration/saved-filter.test.ts` — Create: integration tests (CRUD, isShared visibility, owner-only edit, cross-workspace miss).

**Shared (packages/shared):**

- `packages/shared/src/saved-filter.ts` — Create: `savedFilterQuerySchema`, `createSavedFilterSchema`, `updateSavedFilterSchema`, `savedFilterSchema`, types.
- `packages/shared/src/index.ts` — Modify: re-export saved-filter.
- `packages/shared/tsup.config.ts` — Modify: add `src/saved-filter.ts` entry.
- `packages/shared/package.json` — Modify: add `./saved-filter` export.

**Frontend (apps/web):**

- `apps/web/src/features/saved-filter/types.ts` — Create: `SavedFilter` type.
- `apps/web/src/features/saved-filter/schemas.ts` — Create: response schema (re-uses shared).
- `apps/web/src/features/saved-filter/api.ts` — Create: `savedFilterApi.{list,create,update,delete}`.
- `apps/web/src/features/saved-filter/hooks.ts` — Create: `useSavedFilters`, `useCreateSavedFilter`, `useUpdateSavedFilter`, `useDeleteSavedFilter`.
- `apps/web/src/features/saved-filter/components/SaveFilterDialog.tsx` — Create: name + isShared inputs from current filter state.
- `apps/web/src/features/saved-filter/components/LoadFilterDropdown.tsx` — Create: dropdown listing saved filters, click-to-apply.
- `apps/web/src/features/saved-filter/components/ManageFiltersDialog.tsx` — Create: list + edit/delete.
- `apps/web/src/features/saved-filter/components/SaveFilterDialog.test.tsx` — Create: component test (F8 pattern).
- `apps/web/src/features/saved-filter/index.ts` — Create: public exports.
- `apps/web/src/pages/list.tsx` — Modify: mount Save/Load/Manage UI, apply filter on load.

**Artifacts:**

- `feature_list.json` — Modify: add `P1-2` entry, mark `in_progress` then `passing`.
- `claude-progress.md` — Modify: append session record.

---

### Task 1: Prisma migration — SavedFilter model

**Files:**

- Create: `packages/db/prisma/migrations/<timestamp>_saved_filter/migration.sql`
- Modify: `packages/db/prisma/schema.prisma` (add `SavedFilter` model + relations on `User` and `Workspace`)
- Modify: `apps/api/src/shared/lib/prisma-extension.ts` (add `'SavedFilter'` to `SOFT_DELETE_MODELS`)

**Interfaces:**

- Produces: `SavedFilter` table with columns `id`, `userId`, `workspaceId`, `name`, `query` (Json), `isShared` (Boolean), `createdAt`, `updatedAt`, `deletedAt`. Indexes: `@@index([workspaceId, userId])`, `@@unique([workspaceId, userId, name])`. Used by Task 3 repository.

- [ ] **Step 1: Create the migration file with --create-only**

Run:

```bash
cd /home/thanh/flow-desk
bash scripts/prisma-exec.sh migrate dev --name saved_filter --create-only
```

Expected: a new directory `packages/db/prisma/migrations/<timestamp>_saved_filter/` containing an empty `migration.sql`.

- [ ] **Step 2: Write the migration SQL**

Replace the contents of `packages/db/prisma/migrations/<timestamp>_saved_filter/migration.sql` with:

```sql
-- CreateTable
CREATE TABLE "SavedFilter" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" JSONB NOT NULL,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SavedFilter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedFilter_workspaceId_userId_idx" ON "SavedFilter"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "SavedFilter_userId_idx" ON "SavedFilter"("userId");

-- CreateIndex
CREATE INDEX "SavedFilter_workspaceId_idx" ON "SavedFilter"("workspaceId");

-- CreateIndex
CREATE INDEX "SavedFilter_deletedAt_idx" ON "SavedFilter"("deletedAt");

-- AddForeignKey
ALTER TABLE "SavedFilter" ADD CONSTRAINT "SavedFilter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedFilter" ADD CONSTRAINT "SavedFilter_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateUnique
CREATE UNIQUE INDEX "SavedFilter_workspaceId_userId_name_key" ON "SavedFilter"("workspaceId", "userId", "name") WHERE "deletedAt" IS NULL;
```

Note: the unique index is partial (`WHERE "deletedAt" IS NULL`) so soft-deleted filters don't block name reuse. Prisma's `@@unique` can't express partial indexes — use a raw `CREATE UNIQUE INDEX ... WHERE` here and document the `@@unique` omission in `schema.prisma` with a comment.

- [ ] **Step 3: Add the SavedFilter model to schema.prisma**

In `packages/db/prisma/schema.prisma`, add the `SavedFilter` model. Place it after the `Attachment` model (before `RefreshToken`):

```prisma
model SavedFilter {
  id          String   @id @default(cuid())
  userId      String
  workspaceId String
  name        String
  query       Json
  isShared    Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  deletedAt   DateTime?

  user      User       @relation("SavedFilterOwner", fields: [userId], references: [id], onDelete: Cascade)
  workspace Workspace   @relation("SavedFilterWorkspace", fields: [workspaceId], references: [id], onDelete: Cascade)

  @@index([workspaceId, userId])
  @@index([userId])
  @@index([workspaceId])
  @@index([deletedAt])
  // @@unique([workspaceId, userId, name]) is a partial unique index in the
  // migration (WHERE "deletedAt" IS NULL) — Prisma can't express partial
  // unique indexes, so it's enforced via raw SQL in the migration only.
}
```

Add the reverse relations. On `User` (after the `activities` relation line):

```prisma
  savedFilters SavedFilter[] @relation("SavedFilterOwner")
```

On `Workspace` (after the `activities` relation line, if present, or after `attachments`):

```prisma
  savedFilters SavedFilter[] @relation("SavedFilterWorkspace")
```

- [ ] **Step 4: Add SavedFilter to the softDeleteExtension model set**

In `apps/api/src/shared/lib/prisma-extension.ts`, find the `SOFT_DELETE_MODELS` set (or equivalent constant — grep for `'Task'` to locate it) and add `'SavedFilter'`:

```ts
const SOFT_DELETE_MODELS = new Set([
  'User',
  'Workspace',
  'Task',
  'TaskLabel',
  'TaskLabelAssignment',
  'Comment',
  'SavedFilter',
]);
```

- [ ] **Step 5: Apply the migration + regenerate client**

Run:

```bash
cd /home/thanh/flow-desk
bash scripts/prisma-exec.sh migrate dev
```

Expected: migration applied, `prisma generate` runs, no drift detected.

- [ ] **Step 6: Verify the table exists**

Run:

```bash
cd /home/thanh/flow-desk
docker compose exec -T postgres psql -U flowdesk -d flowdesk -c "\d \"SavedFilter\"" 2>&1 | head -15
```

Expected: table with columns `id`, `userId`, `workspaceId`, `name`, `query`, `isShared`, `createdAt`, `updatedAt`, `deletedAt` + the partial unique index.

- [ ] **Step 7: Commit**

```bash
cd /home/thanh/flow-desk
git add packages/db/prisma/migrations/<timestamp>_saved_filter/migration.sql packages/db/prisma/schema.prisma apps/api/src/shared/lib/prisma-extension.ts
git commit -m "feat(saved-filter): SavedFilter model + soft-delete wiring"
```

---

### Task 2: Shared saved-filter schemas

**Files:**

- Create: `packages/shared/src/saved-filter.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/tsup.config.ts`
- Modify: `packages/shared/package.json`

**Interfaces:**

- Consumes: `taskPrioritySchema`, `taskStatusSchema` from `./task`, `cuidSchema` from `./common`.
- Produces: `savedFilterQuerySchema`, `createSavedFilterSchema`, `updateSavedFilterSchema`, `savedFilterSchema`, `savedFilterListResponseSchema`, types. Consumed by Task 4 service, Task 5 routes, Task 7 web.

- [ ] **Step 1: Write the schemas**

Create `packages/shared/src/saved-filter.ts`:

```ts
import { z } from 'zod';
import { cuidSchema } from './common';
import { taskPrioritySchema, taskStatusSchema } from './task';

// Matches the filter fields of listTasksQuerySchema (no pagination, no
// workspaceId — workspaceId is inferred from the URL path; saved views are
// filter sets, not page states).
export const savedFilterQuerySchema = z.object({
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assigneeId: cuidSchema.nullable().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'dueDate', 'priority', 'position']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});
export type SavedFilterQuery = z.infer<typeof savedFilterQuerySchema>;

export const savedFilterSchema = z.object({
  id: cuidSchema,
  userId: cuidSchema,
  workspaceId: cuidSchema,
  name: z.string().min(1).max(80),
  query: savedFilterQuerySchema,
  isShared: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SavedFilter = z.infer<typeof savedFilterSchema>;

export const createSavedFilterSchema = z.object({
  name: z.string().min(1).max(80).trim(),
  query: savedFilterQuerySchema,
  isShared: z.boolean().default(false),
});
export type CreateSavedFilterInput = z.infer<typeof createSavedFilterSchema>;

export const updateSavedFilterSchema = z.object({
  name: z.string().min(1).max(80).trim().optional(),
  query: savedFilterQuerySchema.optional(),
  isShared: z.boolean().optional(),
});
export type UpdateSavedFilterInput = z.infer<typeof updateSavedFilterSchema>;

export const savedFilterListResponseSchema = z.object({
  data: z.array(savedFilterSchema),
});
export type SavedFilterListResponse = z.infer<typeof savedFilterListResponseSchema>;
```

- [ ] **Step 2: Re-export from index**

In `packages/shared/src/index.ts`, append:

```ts
export * from './saved-filter';
```

- [ ] **Step 3: Add tsup entry**

In `packages/shared/tsup.config.ts`, add `'src/saved-filter.ts'` to the `entry` array (after `'src/search.ts'`):

```ts
    'src/search.ts',
    'src/saved-filter.ts',
  ],
```

- [ ] **Step 4: Add package.json export**

In `packages/shared/package.json`, add a `./saved-filter` entry inside `exports` (after the `./search` entry):

```json
    "./search": {
      "types": "./dist/search.d.ts",
      "import": "./dist/search.mjs",
      "require": "./dist/search.js"
    },
    "./saved-filter": {
      "types": "./dist/saved-filter.d.ts",
      "import": "./dist/saved-filter.mjs",
      "require": "./dist/saved-filter.js"
    }
```

- [ ] **Step 5: Build + verify**

Run:

```bash
cd /home/thanh/flow-desk
pnpm --filter @flow-desk/shared build
pnpm --filter @flow-desk/shared typecheck
```

Expected: both exit 0, `dist/saved-filter.{js,mjs,d.ts}` exist.

- [ ] **Step 6: Commit**

```bash
cd /home/thanh/flow-desk
git add packages/shared/src/saved-filter.ts packages/shared/src/index.ts packages/shared/tsup.config.ts packages/shared/package.json
git commit -m "feat(shared): saved-filter Zod schemas + export wiring"
```

---

### Task 3: SavedFilter repository

**Files:**

- Create: `apps/api/src/modules/saved-filter/saved-filter.repository.ts`

**Interfaces:**

- Consumes: `PrismaClient` from `../../../../packages/db/generated/client`, `SavedFilterQuery` from `@flow-desk/shared/saved-filter`.
- Produces: `listForUser(prisma, userId, workspaceId)`, `listVisible(prisma, userId, workspaceId)`, `findOwnedById(prisma, id, userId)`, `create(prisma, input)`, `update(prisma, id, input)`, `softDelete(prisma, id)`. Consumed by Task 4 service.

- [ ] **Step 1: Write the repository**

Create `apps/api/src/modules/saved-filter/saved-filter.repository.ts`:

```ts
import type { PrismaClient } from '../../../../packages/db/generated/client';
import type { SavedFilterQuery } from '@flow-desk/shared/saved-filter';

export interface SavedFilterRow {
  id: string;
  userId: string;
  workspaceId: string;
  name: string;
  query: SavedFilterQuery;
  isShared: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateInput {
  userId: string;
  workspaceId: string;
  name: string;
  query: SavedFilterQuery;
  isShared: boolean;
}

export interface UpdateInput {
  name?: string;
  query?: SavedFilterQuery;
  isShared?: boolean;
}

// All queries go through the softDeleteExtension (SavedFilter is in
// SOFT_DELETE_MODELS) — no manual deletedAt IS NULL filter needed.
export async function listOwned(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
): Promise<SavedFilterRow[]> {
  return prisma.savedFilter.findMany({
    where: { userId, workspaceId },
    orderBy: { createdAt: 'asc' },
  });
}

// Visible = owned by user OR shared by anyone in the workspace.
export async function listVisible(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
): Promise<SavedFilterRow[]> {
  return prisma.savedFilter.findMany({
    where: {
      workspaceId,
      OR: [{ userId }, { isShared: true }],
    },
    orderBy: [{ isShared: 'asc' }, { name: 'asc' }],
  });
}

export async function findOwnedById(
  prisma: PrismaClient,
  id: string,
  userId: string,
): Promise<SavedFilterRow | null> {
  return prisma.savedFilter.findFirst({
    where: { id, userId },
  });
}

export async function findById(prisma: PrismaClient, id: string): Promise<SavedFilterRow | null> {
  return prisma.savedFilter.findUnique({ where: { id } });
}

export async function create(prisma: PrismaClient, input: CreateInput): Promise<SavedFilterRow> {
  return prisma.savedFilter.create({ data: input });
}

export async function update(
  prisma: PrismaClient,
  id: string,
  input: UpdateInput,
): Promise<SavedFilterRow> {
  return prisma.savedFilter.update({ where: { id }, data: input });
}

export async function softDelete(prisma: PrismaClient, id: string): Promise<void> {
  await prisma.savedFilter.update({ where: { id }, data: { deletedAt: new Date() } });
}
```

- [ ] **Step 2: Typecheck**

Run:

```bash
cd /home/thanh/flow-desk
pnpm --filter @flow-desk/api typecheck
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
cd /home/thanh/flow-desk
git add apps/api/src/modules/saved-filter/saved-filter.repository.ts
git commit -m "feat(saved-filter): repository — Prisma queries (list/find/create/update/softDelete)"
```

---

### Task 4: SavedFilter service

**Files:**

- Create: `apps/api/src/modules/saved-filter/saved-filter.service.ts`
- Create: `apps/api/src/modules/saved-filter/index.ts`

**Interfaces:**

- Consumes: `* as repo` from `./saved-filter.repository`, `CreateSavedFilterInput`/`UpdateSavedFilterInput` from `@flow-desk/shared/saved-filter`, `assertMembership` from `../../shared/lib/access`, `NotFoundError`/`ForbiddenError`/`ConflictError` from `../../shared/errors`.
- Produces: `savedFilterService.{list, create, update, remove}`. Consumed by Task 5 routes.

- [ ] **Step 1: Write the service**

Create `apps/api/src/modules/saved-filter/saved-filter.service.ts`:

```ts
import type { PrismaClient } from '../../../../packages/db/generated/client';
import type {
  CreateSavedFilterInput,
  UpdateSavedFilterInput,
  SavedFilterQuery,
} from '@flow-desk/shared/saved-filter';
import { assertMembership } from '../../shared/lib/access';
import { NotFoundError, ForbiddenError, ConflictError } from '../../shared/errors';
import * as repo from './saved-filter.repository';

export async function list(prisma: PrismaClient, userId: string, workspaceId: string) {
  await assertMembership(workspaceId, userId);
  const rows = await repo.listVisible(prisma, userId, workspaceId);
  return {
    data: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      workspaceId: r.workspaceId,
      name: r.name,
      query: r.query as SavedFilterQuery,
      isShared: r.isShared,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  };
}

export async function create(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
  input: CreateSavedFilterInput,
) {
  await assertMembership(workspaceId, userId);
  // Name uniqueness per (workspaceId, userId) — partial unique index covers
  // soft-deleted rows, so a conflict here means an active filter owns the name.
  const existing = await prisma.savedFilter.findFirst({
    where: { workspaceId, userId, name: input.name },
  });
  if (existing) {
    throw new ConflictError(`A saved filter named "${input.name}" already exists`);
  }
  const row = await repo.create(prisma, {
    userId,
    workspaceId,
    name: input.name,
    query: input.query,
    isShared: input.isShared,
  });
  return {
    id: row.id,
    userId: row.userId,
    workspaceId: row.workspaceId,
    name: row.name,
    query: row.query as SavedFilterQuery,
    isShared: row.isShared,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function update(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
  filterId: string,
  input: UpdateSavedFilterInput,
) {
  await assertMembership(workspaceId, userId);
  const owned = await repo.findOwnedById(prisma, filterId, userId);
  if (!owned || owned.workspaceId !== workspaceId) {
    throw new NotFoundError('Saved filter not found');
  }
  // If renaming, check the new name isn't taken by another active filter.
  if (input.name && input.name !== owned.name) {
    const clash = await prisma.savedFilter.findFirst({
      where: { workspaceId, userId, name: input.name, NOT: { id: filterId } },
    });
    if (clash) {
      throw new ConflictError(`A saved filter named "${input.name}" already exists`);
    }
  }
  const row = await repo.update(prisma, filterId, {
    name: input.name,
    query: input.query,
    isShared: input.isShared,
  });
  return {
    id: row.id,
    userId: row.userId,
    workspaceId: row.workspaceId,
    name: row.name,
    query: row.query as SavedFilterQuery,
    isShared: row.isShared,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function remove(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
  filterId: string,
) {
  await assertMembership(workspaceId, userId);
  const owned = await repo.findOwnedById(prisma, filterId, userId);
  if (!owned || owned.workspaceId !== workspaceId) {
    throw new NotFoundError('Saved filter not found');
  }
  await repo.softDelete(prisma, filterId);
  return { ok: true };
}

export const savedFilterService = { list, create, update, remove };
```

- [ ] **Step 2: Write the index**

Create `apps/api/src/modules/saved-filter/index.ts`:

```ts
export { savedFilterService } from './saved-filter.service';
```

- [ ] **Step 3: Typecheck**

Run:

```bash
cd /home/thanh/flow-desk
pnpm --filter @flow-desk/api typecheck
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
cd /home/thanh/flow-desk
git add apps/api/src/modules/saved-filter/saved-filter.service.ts apps/api/src/modules/saved-filter/index.ts
git commit -m "feat(saved-filter): service — membership + ownership + isShared visibility"
```

---

### Task 5: Routes + register in app.ts

**Files:**

- Create: `apps/api/src/modules/saved-filter/saved-filter.routes.ts`
- Modify: `apps/api/src/app.ts` (register router)

**Interfaces:**

- Consumes: `savedFilterService` from `./saved-filter.service`, `createSavedFilterSchema`/`updateSavedFilterSchema`/`savedFilterListResponseSchema`/`savedFilterSchema` from `@flow-desk/shared/saved-filter`, `requireAuth`/`requireWorkspaceRole` from `../../shared/middleware/auth`.
- Produces: `GET/POST/PATCH/DELETE /api/workspaces/:wid/saved-filters`.

- [ ] **Step 1: Write the routes**

Create `apps/api/src/modules/saved-filter/saved-filter.routes.ts`:

```ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  createSavedFilterSchema,
  updateSavedFilterSchema,
  savedFilterListResponseSchema,
  savedFilterSchema,
} from '@flow-desk/shared/saved-filter';
import { requireAuth, requireWorkspaceRole } from '../../shared/middleware/auth';
import { prisma } from '../../shared/lib/prisma';
import { savedFilterService } from './saved-filter.service';

export const savedFilterRouter = new Hono();
savedFilterRouter.use('*', requireAuth());

// Any member can list + create saved filters.
savedFilterRouter.get('/', async (c) => {
  const wid = c.req.param('wid')!;
  const auth = c.get('auth');
  const result = await savedFilterService.list(prisma, auth.user.id, wid);
  return c.json(savedFilterListResponseSchema.parse(result));
});

savedFilterRouter.post(
  '/',
  zValidator('json', createSavedFilterSchema, (result, c) => {
    if (!result.success) {
      return c.json({ code: 'INVALID_BODY', details: result.error.flatten() }, 400);
    }
    return undefined;
  }),
  async (c) => {
    const wid = c.req.param('wid')!;
    const auth = c.get('auth');
    const body = c.req.valid('json');
    const result = await savedFilterService.create(prisma, auth.user.id, wid, body);
    return c.json(savedFilterSchema.parse(result), 201);
  },
);

savedFilterRouter.patch(
  '/:id',
  zValidator('json', updateSavedFilterSchema, (result, c) => {
    if (!result.success) {
      return c.json({ code: 'INVALID_BODY', details: result.error.flatten() }, 400);
    }
    return undefined;
  }),
  async (c) => {
    const wid = c.req.param('wid')!;
    const id = c.req.param('id')!;
    const auth = c.get('auth');
    const body = c.req.valid('json');
    const result = await savedFilterService.update(prisma, auth.user.id, wid, id, body);
    return c.json(savedFilterSchema.parse(result));
  },
);

savedFilterRouter.delete('/:id', async (c) => {
  const wid = c.req.param('wid')!;
  const id = c.req.param('id')!;
  const auth = c.get('auth');
  const result = await savedFilterService.remove(prisma, auth.user.id, wid, id);
  return c.json(result);
});
```

- [ ] **Step 2: Register the router in app.ts**

In `apps/api/src/app.ts`, add the import (after the `searchRouter` import):

```ts
import { savedFilterRouter } from './modules/saved-filter/saved-filter.routes';
```

And register the route (after `app.route('/api/search', searchRouter);`):

```ts
app.route('/api/workspaces/:wid/saved-filters', savedFilterRouter);
```

- [ ] **Step 3: Typecheck**

Run:

```bash
cd /home/thanh/flow-desk
pnpm --filter @flow-desk/api typecheck
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
cd /home/thanh/flow-desk
git add apps/api/src/modules/saved-filter/saved-filter.routes.ts apps/api/src/app.ts
git commit -m "feat(saved-filter): CRUD routes at /api/workspaces/:wid/saved-filters + register"
```

---

### Task 6: Backend integration tests

**Files:**

- Create: `apps/api/tests/integration/saved-filter.test.ts`

**Interfaces:**

- Consumes: `buildApp` from `../../src/app`, factories from `../setup/factories`, `getTestPrisma` from `../setup/integration`.

- [ ] **Step 1: Write the integration test**

Create `apps/api/tests/integration/saved-filter.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getTestPrisma } from '../setup/integration';
import {
  cleanDatabase,
  createUser,
  createWorkspace,
  addMember,
  createTask,
  getAuthCookie,
} from '../setup/factories';
import { buildApp } from '../../src/app';

describe('GET/POST/PATCH/DELETE /api/workspaces/:wid/saved-filters (P1-2)', () => {
  let prisma: ReturnType<typeof getTestPrisma>;

  beforeEach(async () => {
    prisma = getTestPrisma();
    await cleanDatabase(prisma);
  });

  async function setup() {
    const owner = await createUser(prisma, 'owner@test.local', 'Owner');
    const w = await createWorkspace(prisma, owner.id, 'Filter WS');
    const cookie = await getAuthCookie(prisma, owner.id);
    return { ownerId: owner.id, wid: w.id, cookie };
  }

  it('creates a saved filter and lists it for the owner', async () => {
    const { wid, cookie } = await setup();
    const app = buildApp();
    const createRes = await app.request(`/api/workspaces/${wid}/saved-filters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        name: 'Hot queue',
        query: { status: 'IN_REVIEW', priority: 'HIGH' },
        isShared: false,
      }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.name).toBe('Hot queue');
    expect(created.query.status).toBe('IN_REVIEW');

    const listRes = await app.request(`/api/workspaces/${wid}/saved-filters`, {
      headers: { Cookie: cookie },
    });
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.data).toHaveLength(1);
    expect(listBody.data[0].name).toBe('Hot queue');
  });

  it('rejects duplicate name for the same user with 409', async () => {
    const { wid, cookie } = await setup();
    const app = buildApp();
    const body = JSON.stringify({
      name: 'Dup',
      query: { status: 'TODO' },
      isShared: false,
    });
    await app.request(`/api/workspaces/${wid}/saved-filters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body,
    });
    const res = await app.request(`/api/workspaces/${wid}/saved-filters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body,
    });
    expect(res.status).toBe(409);
  });

  it('isShared filter is visible to other workspace members', async () => {
    const { ownerId, wid, cookie } = await setup();
    const bob = await createUser(prisma, 'bob@test.local', 'Bob');
    await addMember(prisma, wid, bob.id, 'MEMBER');
    const bobCookie = await getAuthCookie(prisma, bob.id);
    const app = buildApp();
    await app.request(`/api/workspaces/${wid}/saved-filters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        name: 'Team view',
        query: { status: 'IN_PROGRESS' },
        isShared: true,
      }),
    });
    const res = await app.request(`/api/workspaces/${wid}/saved-filters`, {
      headers: { Cookie: bobCookie },
    });
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Team view');
  });

  it('private filter is NOT visible to other workspace members', async () => {
    const { wid, cookie } = await setup();
    const bob = await createUser(prisma, 'bob@test.local', 'Bob');
    await addMember(prisma, wid, bob.id, 'MEMBER');
    const bobCookie = await getAuthCookie(prisma, bob.id);
    const app = buildApp();
    await app.request(`/api/workspaces/${wid}/saved-filters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        name: 'My private',
        query: { status: 'TODO' },
        isShared: false,
      }),
    });
    const res = await app.request(`/api/workspaces/${wid}/saved-filters`, {
      headers: { Cookie: bobCookie },
    });
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  it('only the owner can patch their filter (other member gets 404)', async () => {
    const { wid, cookie } = await setup();
    const bob = await createUser(prisma, 'bob@test.local', 'Bob');
    await addMember(prisma, wid, bob.id, 'MEMBER');
    const bobCookie = await getAuthCookie(prisma, bob.id);
    const app = buildApp();
    const createRes = await app.request(`/api/workspaces/${wid}/saved-filters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        name: 'Owner only',
        query: { status: 'TODO' },
        isShared: true,
      }),
    });
    const created = await createRes.json();
    const res = await app.request(`/api/workspaces/${wid}/saved-filters/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: bobCookie },
      body: JSON.stringify({ name: 'Hijacked' }),
    });
    expect(res.status).toBe(404);
  });

  it('owner can patch and delete their own filter', async () => {
    const { wid, cookie } = await setup();
    const app = buildApp();
    const createRes = await app.request(`/api/workspaces/${wid}/saved-filters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        name: 'To edit',
        query: { status: 'TODO' },
        isShared: false,
      }),
    });
    const created = await createRes.json();
    const patchRes = await app.request(`/api/workspaces/${wid}/saved-filters/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ name: 'Renamed', isShared: true }),
    });
    expect(patchRes.status).toBe(200);
    const patched = await patchRes.json();
    expect(patched.name).toBe('Renamed');
    expect(patched.isShared).toBe(true);

    const delRes = await app.request(`/api/workspaces/${wid}/saved-filters/${created.id}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
    expect(delRes.status).toBe(200);
    const listRes = await app.request(`/api/workspaces/${wid}/saved-filters`, {
      headers: { Cookie: cookie },
    });
    const listBody = await listRes.json();
    expect(listBody.data).toHaveLength(0);
  });

  it('soft-deleted filter name can be reused', async () => {
    const { wid, cookie } = await setup();
    const app = buildApp();
    const body = JSON.stringify({
      name: 'Reusable',
      query: { status: 'TODO' },
      isShared: false,
    });
    const createRes = await app.request(`/api/workspaces/${wid}/saved-filters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body,
    });
    const created = await createRes.json();
    await app.request(`/api/workspaces/${wid}/saved-filters/${created.id}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
    const recreateRes = await app.request(`/api/workspaces/${wid}/saved-filters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body,
    });
    expect(recreateRes.status).toBe(201);
  });

  it('rejects non-member requests with 401', async () => {
    const { wid } = await setup();
    const outsider = await createUser(prisma, 'outsider@test.local', 'Outsider');
    const outsiderCookie = await getAuthCookie(prisma, outsider.id);
    const app = buildApp();
    const res = await app.request(`/api/workspaces/${wid}/saved-filters`, {
      headers: { Cookie: outsiderCookie },
    });
    expect(res.status).toBe(401);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const { wid } = await setup();
    const app = buildApp();
    const res = await app.request(`/api/workspaces/${wid}/saved-filters`);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the integration tests**

Run:

```bash
cd /home/thanh/flow-desk
pnpm --filter @flow-desk/api test:integration -- saved-filter
```

Expected: 9 tests pass.

- [ ] **Step 3: Run the full integration suite (regression check)**

Run:

```bash
cd /home/thanh/flow-desk
pnpm --filter @flow-desk/api test:integration
```

Expected: all tests pass (existing 198 plus 9 new).

- [ ] **Step 4: Commit**

```bash
cd /home/thanh/flow-desk
git add apps/api/tests/integration/saved-filter.test.ts
git commit -m "test(saved-filter): integration tests — CRUD, isShared visibility, owner-only, name reuse"
```

---

### Task 7: Web saved-filter feature (api + hooks + types)

**Files:**

- Create: `apps/web/src/features/saved-filter/types.ts`
- Create: `apps/web/src/features/saved-filter/schemas.ts`
- Create: `apps/web/src/features/saved-filter/api.ts`
- Create: `apps/web/src/features/saved-filter/hooks.ts`
- Create: `apps/web/src/features/saved-filter/index.ts`

**Interfaces:**

- Consumes: `SavedFilter`, `savedFilterSchema`, `savedFilterListResponseSchema`, `createSavedFilterSchema`, `updateSavedFilterSchema` from `@flow-desk/shared/saved-filter`, `api` from `@/lib/api`.
- Produces: `savedFilterApi.{list, create, update, delete}`, `useSavedFilters`, `useCreateSavedFilter`, `useUpdateSavedFilter`, `useDeleteSavedFilter`, `SavedFilter` type. Consumed by Task 8 UI.

- [ ] **Step 1: Write types**

Create `apps/web/src/features/saved-filter/types.ts`:

```ts
import type { SavedFilter } from '@flow-desk/shared/saved-filter';
export type { SavedFilter };
```

- [ ] **Step 2: Write schemas**

Create `apps/web/src/features/saved-filter/schemas.ts`:

```ts
import {
  savedFilterListResponseSchema,
  savedFilterSchema,
  createSavedFilterSchema,
  updateSavedFilterSchema,
} from '@flow-desk/shared/saved-filter';
export {
  savedFilterListResponseSchema,
  savedFilterSchema,
  createSavedFilterSchema,
  updateSavedFilterSchema,
};
```

- [ ] **Step 3: Write the API client**

Create `apps/web/src/features/saved-filter/api.ts`:

```ts
import type { SavedFilter } from '@flow-desk/shared/saved-filter';
import { api } from '@/lib/api';
import { savedFilterListResponseSchema, savedFilterSchema } from './schemas';

export const savedFilterApi = {
  list(workspaceId: string) {
    return api<{ data: SavedFilter[] }>(`/api/workspaces/${workspaceId}/saved-filters`, {
      schema: savedFilterListResponseSchema,
    });
  },
  create(workspaceId: string, body: { name: string; query: unknown; isShared: boolean }) {
    return api<SavedFilter>(`/api/workspaces/${workspaceId}/saved-filters`, {
      method: 'POST',
      json: body,
      schema: savedFilterSchema,
    });
  },
  update(
    workspaceId: string,
    id: string,
    body: { name?: string; query?: unknown; isShared?: boolean },
  ) {
    return api<SavedFilter>(`/api/workspaces/${workspaceId}/saved-filters/${id}`, {
      method: 'PATCH',
      json: body,
      schema: savedFilterSchema,
    });
  },
  delete(workspaceId: string, id: string) {
    return api<{ ok: boolean }>(`/api/workspaces/${workspaceId}/saved-filters/${id}`, {
      method: 'DELETE',
    });
  },
};
```

- [ ] **Step 4: Write the hooks**

Create `apps/web/src/features/saved-filter/hooks.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { savedFilterApi } from './api';

export const savedFilterKeys = {
  list: (workspaceId: string) => ['saved-filters', workspaceId] as const,
};

export function useSavedFilters(workspaceId: string) {
  return useQuery({
    queryKey: savedFilterKeys.list(workspaceId),
    queryFn: () => savedFilterApi.list(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
  });
}

export function useCreateSavedFilter(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; query: unknown; isShared: boolean }) =>
      savedFilterApi.create(workspaceId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: savedFilterKeys.list(workspaceId) }),
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to save filter';
      toast.error(msg);
    },
  });
}

export function useUpdateSavedFilter(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: { name?: string; query?: unknown; isShared?: boolean };
    }) => savedFilterApi.update(workspaceId, id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: savedFilterKeys.list(workspaceId) }),
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to update filter';
      toast.error(msg);
    },
  });
}

export function useDeleteSavedFilter(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => savedFilterApi.delete(workspaceId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: savedFilterKeys.list(workspaceId) }),
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to delete filter';
      toast.error(msg);
    },
  });
}
```

- [ ] **Step 5: Write the index**

Create `apps/web/src/features/saved-filter/index.ts`:

```ts
export { savedFilterApi } from './api';
export {
  savedFilterKeys,
  useSavedFilters,
  useCreateSavedFilter,
  useUpdateSavedFilter,
  useDeleteSavedFilter,
} from './hooks';
export type { SavedFilter } from './types';
export { SaveFilterDialog } from './components/SaveFilterDialog';
export { LoadFilterDropdown } from './components/LoadFilterDropdown';
export { ManageFiltersDialog } from './components/ManageFiltersDialog';
```

- [ ] **Step 6: Typecheck**

Run:

```bash
cd /home/thanh/flow-desk
pnpm --filter @flow-desk/web typecheck
```

Expected: fails on the missing `./components/*` imports (created in Task 8). Proceed to Task 8 and re-run; or temporarily comment the component export lines and uncomment after Task 8.

- [ ] **Step 7: Commit**

```bash
cd /home/thanh/flow-desk
git add apps/web/src/features/saved-filter/
git commit -m "feat(web/saved-filter): api client + hooks + types"
```

---

### Task 8: Web UI — Save/Load/Manage + wire into list page

**Files:**

- Create: `apps/web/src/features/saved-filter/components/SaveFilterDialog.tsx`
- Create: `apps/web/src/features/saved-filter/components/LoadFilterDropdown.tsx`
- Create: `apps/web/src/features/saved-filter/components/ManageFiltersDialog.tsx`
- Modify: `apps/web/src/pages/list.tsx` (mount Save/Load/Manage UI, apply filter on load)

**Interfaces:**

- Consumes: `useSavedFilters`, `useCreateSavedFilter`, `useUpdateSavedFilter`, `useDeleteSavedFilter` from `../hooks`, `SavedFilter` from `../types`, shadcn `Dialog`/`DropdownMenu`/`Button`/`Input`/`Checkbox` from `@/components/ui/*`.
- Produces: `SaveFilterDialog` (controlled open/onOpenChange, receives current query), `LoadFilterDropdown` (receives onApply callback), `ManageFiltersDialog` (controlled open/onOpenChange).

- [ ] **Step 1: Write the SaveFilterDialog component**

Create `apps/web/src/features/saved-filter/components/SaveFilterDialog.tsx`:

```tsx
import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useCreateSavedFilter } from '../hooks';
import type { SavedFilterQuery } from '@flow-desk/shared/saved-filter';

interface SaveFilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  currentQuery: SavedFilterQuery;
}

export function SaveFilterDialog({
  open,
  onOpenChange,
  workspaceId,
  currentQuery,
}: SaveFilterDialogProps) {
  const [name, setName] = React.useState('');
  const [isShared, setIsShared] = React.useState(false);
  const create = useCreateSavedFilter(workspaceId);

  React.useEffect(() => {
    if (open) {
      setName('');
      setIsShared(false);
    }
  }, [open]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), query: currentQuery, isShared },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save current filter</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="save-filter-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="save-filter-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Hot queue"
              maxLength={80}
              required
              autoFocus
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={isShared}
              onCheckedChange={(v) => setIsShared(v === true)}
              aria-label="Share with workspace members"
            />
            Share with workspace members
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || !name.trim()}>
              {create.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Write the LoadFilterDropdown component**

Create `apps/web/src/features/saved-filter/components/LoadFilterDropdown.tsx`:

```tsx
import { Bookmark, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useSavedFilters } from '../hooks';
import type { SavedFilterQuery } from '@flow-desk/shared/saved-filter';

interface LoadFilterDropdownProps {
  workspaceId: string;
  onApply: (query: SavedFilterQuery) => void;
  onManage: () => void;
}

export function LoadFilterDropdown({ workspaceId, onApply, onManage }: LoadFilterDropdownProps) {
  const { data, isLoading } = useSavedFilters(workspaceId);
  const filters = data?.data ?? [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Bookmark className="size-4" />
          Saved views
          <ChevronDown className="size-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Saved views</DropdownMenuLabel>
        {isLoading ? (
          <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
        ) : filters.length === 0 ? (
          <DropdownMenuItem disabled>No saved views yet</DropdownMenuItem>
        ) : (
          filters.map((f) => (
            <DropdownMenuItem
              key={f.id}
              onClick={() => onApply(f.query)}
              className="justify-between"
            >
              <span className="truncate">{f.name}</span>
              {f.isShared && (
                <span className="text-xs text-muted-foreground" aria-label="Shared">
                  shared
                </span>
              )}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onManage}>Manage saved views…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 3: Write the ManageFiltersDialog component**

Create `apps/web/src/features/saved-filter/components/ManageFiltersDialog.tsx`:

```tsx
import * as React from 'react';
import { Trash2, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useSavedFilters, useUpdateSavedFilter, useDeleteSavedFilter } from '../hooks';

interface ManageFiltersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
}

export function ManageFiltersDialog({ open, onOpenChange, workspaceId }: ManageFiltersDialogProps) {
  const { data } = useSavedFilters(workspaceId);
  const updateMut = useUpdateSavedFilter(workspaceId);
  const deleteMut = useDeleteSavedFilter(workspaceId);
  const filters = data?.data ?? [];
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState('');
  const [editShared, setEditShared] = React.useState(false);

  function startEdit(id: string, name: string, isShared: boolean) {
    setEditingId(id);
    setEditName(name);
    setEditShared(isShared);
  }

  function saveEdit() {
    if (!editingId || !editName.trim()) return;
    updateMut.mutate(
      { id: editingId, body: { name: editName.trim(), isShared: editShared } },
      { onSuccess: () => setEditingId(null) },
    );
  }

  function toggleShare(id: string, isShared: boolean) {
    updateMut.mutate({ id, body: { isShared: !isShared } });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage saved views</DialogTitle>
        </DialogHeader>
        <ul className="space-y-2">
          {filters.length === 0 ? (
            <li className="text-sm text-muted-foreground">No saved views yet.</li>
          ) : (
            filters.map((f) => (
              <li
                key={f.id}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
              >
                {editingId === f.id ? (
                  <>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="h-8"
                      autoFocus
                    />
                    <Checkbox
                      checked={editShared}
                      onCheckedChange={(v) => setEditShared(v === true)}
                      aria-label="Shared"
                    />
                    <Button size="sm" onClick={saveEdit} disabled={updateMut.isPending}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
                    <label className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Checkbox
                        checked={f.isShared}
                        onCheckedChange={() => toggleShare(f.id, f.isShared)}
                        aria-label={`Toggle share for ${f.name}`}
                      />
                      shared
                    </label>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => startEdit(f.id, f.name, f.isShared)}
                      aria-label={`Rename ${f.name}`}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => deleteMut.mutate(f.id)}
                      aria-label={`Delete ${f.name}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </>
                )}
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Wire Save/Load/Manage into the list page**

In `apps/web/src/pages/list.tsx`, add imports (after the existing `@/features/...` imports):

```tsx
import { SaveFilterDialog, LoadFilterDropdown, ManageFiltersDialog } from '@/features/saved-filter';
import type { SavedFilterQuery } from '@flow-desk/shared/saved-filter';
import { BookmarkPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
```

Inside `ListPage()`, after the existing `const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('ALL');` line, add:

```tsx
const [saveOpen, setSaveOpen] = useState(false);
const [manageOpen, setManageOpen] = useState(false);

const currentQuery: SavedFilterQuery = {
  ...(statusFilter !== 'ALL' ? { status: statusFilter } : {}),
  ...(priorityFilter !== 'ALL' ? { priority: priorityFilter } : {}),
};

function applySavedFilter(q: SavedFilterQuery) {
  setStatusFilter((q.status as StatusFilter) ?? 'ALL');
  setPriorityFilter((q.priority as PriorityFilter) ?? 'ALL');
}
```

In the filter toolbar (find the existing `<NativeSelect` for status filter — the toolbar is the flex row containing both NativeSelects; add the saved-view controls after the priority NativeSelect, before the results count):

```tsx
<LoadFilterDropdown
  workspaceId={workspaceId}
  onApply={applySavedFilter}
  onManage={() => setManageOpen(true)}
/>
<Button variant="outline" size="sm" onClick={() => setSaveOpen(true)}>
  <BookmarkPlus className="size-4" />
  Save view
</Button>
```

At the end of the component (after the existing modals, before the closing `</>` or `</div>`):

```tsx
<SaveFilterDialog
  open={saveOpen}
  onOpenChange={setSaveOpen}
  workspaceId={workspaceId}
  currentQuery={currentQuery}
/>
<ManageFiltersDialog
  open={manageOpen}
  onOpenChange={setManageOpen}
  workspaceId={workspaceId}
/>
```

- [ ] **Step 5: Typecheck + build**

Run:

```bash
cd /home/thanh/flow-desk
pnpm --filter @flow-desk/web typecheck
pnpm --filter @flow-desk/web build
```

Expected: both exit 0. If `Checkbox` is missing from `@/components/ui/checkbox`, run `pnpm --filter @flow-desk/web exec shadcn add checkbox` and commit that addition separately first.

- [ ] **Step 6: Commit**

```bash
cd /home/thanh/flow-desk
git add apps/web/src/features/saved-filter/components/SaveFilterDialog.tsx apps/web/src/features/saved-filter/components/LoadFilterDropdown.tsx apps/web/src/features/saved-filter/components/ManageFiltersDialog.tsx apps/web/src/pages/list.tsx
git commit -m "feat(web/saved-filter): Save/Load/Manage UI + wire into list page"
```

---

### Task 9: Web component test (F8 pattern)

**Files:**

- Create: `apps/web/src/features/saved-filter/components/SaveFilterDialog.test.tsx`

**Interfaces:**

- Consumes: `SaveFilterDialog` from `./SaveFilterDialog`, vitest + @testing-library/react, `@/lib/api` mock.

- [ ] **Step 1: Write the component test**

Create `apps/web/src/features/saved-filter/components/SaveFilterDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SaveFilterDialog } from './SaveFilterDialog';

vi.mock('@/lib/api', () => ({
  api: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      public body: unknown,
      message: string,
    ) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

import { api } from '@/lib/api';
const mockApi = vi.mocked(api);

function renderDialog(
  open = true,
  onOpenChange = vi.fn(),
  workspaceId = 'ws-test',
  currentQuery: { status?: string; priority?: string } = { status: 'IN_REVIEW', priority: 'HIGH' },
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SaveFilterDialog
        open={open}
        onOpenChange={onOpenChange}
        workspaceId={workspaceId}
        currentQuery={currentQuery}
      />
    </QueryClientProvider>,
  );
}

describe('SaveFilterDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the name input and share checkbox when open', () => {
    renderDialog();
    expect(screen.getByLabelText(/Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Share with workspace members/i)).toBeInTheDocument();
  });

  it('disables the Save button until a name is entered', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('submits the current query with the entered name', async () => {
    mockApi.mockResolvedValue({
      id: 'sf1',
      userId: 'u1',
      workspaceId: 'ws-test',
      name: 'Hot queue',
      query: { status: 'IN_REVIEW', priority: 'HIGH' },
      isShared: false,
      createdAt: '2026-07-05T00:00:00.000Z',
      updatedAt: '2026-07-05T00:00:00.000Z',
    });
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderDialog(true, onOpenChange);
    await user.type(screen.getByLabelText(/Name/i), 'Hot queue');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mockApi).toHaveBeenCalledWith(
      '/api/workspaces/ws-test/saved-filters',
      expect.objectContaining({
        method: 'POST',
        json: {
          name: 'Hot queue',
          query: { status: 'IN_REVIEW', priority: 'HIGH' },
          isShared: false,
        },
      }),
    );
  });

  it('toggles the share checkbox', async () => {
    renderDialog();
    const checkbox = screen.getByLabelText(/Share with workspace members/i);
    expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });
});
```

- [ ] **Step 2: Run the web tests**

Run:

```bash
cd /home/thanh/flow-desk
pnpm --filter @flow-desk/web test -- --run
```

Expected: all web tests pass (existing 18 + new 4 = 22).

- [ ] **Step 3: Commit**

```bash
cd /home/thanh/flow-desk
git add apps/web/src/features/saved-filter/components/SaveFilterDialog.test.tsx
git commit -m "test(web/saved-filter): SaveFilterDialog component tests (F8 pattern)"
```

---

### Task 10: Update feature_list.json + claude-progress.md + verify

**Files:**

- Modify: `feature_list.json`
- Modify: `claude-progress.md`

- [ ] **Step 1: Add the P1-2 entry to feature_list.json**

Open `feature_list.json`. Add this entry to the end of the `features` array (after the `P1-1` entry), and ensure no other feature is `in_progress`:

```json
{
  "id": "P1-2",
  "priority": 89,
  "area": "saved-filter",
  "title": "Saved views / filters on the task list",
  "user_visible_behavior": "User filters the task list (status + priority), clicks 'Save view', names it (e.g. 'Hot queue'), and optionally shares it with workspace members. On reload, the 'Saved views' dropdown lists saved filters; clicking one restores the filters. A manage dialog lets the owner rename, toggle share, or delete saved filters. Private filters are only visible to their owner; shared filters are visible to all workspace members. Cross-workspace users get 401.",
  "status": "passing",
  "verification": [
    "pnpm --filter @flow-desk/shared build → exit 0",
    "pnpm --filter @flow-desk/api typecheck → exit 0",
    "pnpm --filter @flow-desk/api test:integration -- saved-filter → 9/9 pass",
    "pnpm --filter @flow-desk/api test:integration → all pass (no regression)",
    "pnpm --filter @flow-desk/web typecheck → exit 0",
    "pnpm --filter @flow-desk/web build → exit 0",
    "pnpm --filter @flow-desk/web test -- --run → all pass (incl. 4 new SaveFilterDialog tests)",
    "pnpm -r lint → 0 errors 0 warnings",
    "pnpm verify → green",
    "curl POST /api/workspaces/:id/saved-filters with auth cookie → 201, filter JSON",
    "curl GET /api/workspaces/:id/saved-filters without cookie → 401"
  ],
  "evidence": [
    "packages/db/prisma/migrations/<timestamp>_saved_filter/migration.sql — SavedFilter table + @@index([workspaceId, userId]) + partial unique index WHERE deletedAt IS NULL",
    "packages/db/prisma/schema.prisma — SavedFilter model (id, userId, workspaceId, name, query Json, isShared Boolean, soft-delete) + relations on User/Workspace",
    "apps/api/src/shared/lib/prisma-extension.ts — 'SavedFilter' added to SOFT_DELETE_MODELS",
    "packages/shared/src/saved-filter.ts — savedFilterQuerySchema, createSavedFilterSchema, updateSavedFilterSchema, savedFilterSchema, savedFilterListResponseSchema + types; ./saved-filter export wired",
    "apps/api/src/modules/saved-filter/{saved-filter.repository,saved-filter.service,saved-filter.routes,index}.ts — CRUD with assertMembership + ownership check + isShared visibility",
    "apps/api/src/app.ts — app.route('/api/workspaces/:wid/saved-filters', savedFilterRouter)",
    "apps/api/tests/integration/saved-filter.test.ts — 9 integration tests (create+list, duplicate 409, isShared visible to members, private hidden from members, owner-only patch 404 for non-owner, owner patch+delete, soft-deleted name reuse, non-member 401, unauth 401)",
    "apps/web/src/features/saved-filter/{types,schemas,api,hooks,index}.ts — useSavedFilters/useCreate/useUpdate/useDelete with React Query invalidation + sonner toasts",
    "apps/web/src/features/saved-filter/components/{SaveFilterDialog,LoadFilterDropdown,ManageFiltersDialog}.tsx — save-current-filter dialog, load dropdown, manage (rename/toggle-share/delete) dialog",
    "apps/web/src/features/saved-filter/components/SaveFilterDialog.test.tsx — 4 component tests (renders, disabled-until-name, submit with current query, toggle share)",
    "apps/web/src/pages/list.tsx — Save view button + Saved views dropdown + Manage dialog wired; applySavedFilter restores status+priority filters"
  ],
  "notes": "Phase 1 item P1-2 from ROADMAP.md. SavedFilter.query JSON shape = filter fields of listTasksQuerySchema (status, priority, assigneeId, sortBy, sortOrder — no pagination). isShared filters visible to all workspace members; edit/delete owner-only (enforced via findOwnedById). Partial unique index on (workspaceId, userId, name) WHERE deletedAt IS NULL — Prisma @@unique can't express partial indexes, so enforced via raw SQL in migration only. Soft-delete covered by softDeleteExtension (no manual deletedAt filter in repository). Schema hygiene checklist respected: no board-in-names, no structural fields on Task."
}
```

Replace `<timestamp>` in the evidence with the actual migration directory name from Task 1.

- [ ] **Step 2: Run the full verify gate**

Run:

```bash
cd /home/thanh/flow-desk
pnpm verify
```

Expected: exit 0 (typecheck + lint + unit tests + integration tests + web build all green).

- [ ] **Step 3: Live smoke against a running API**

If the docker stack is up (or use host-side `pnpm exec tsx src/index.ts` against the dev DB like P1-1):

```bash
cd /home/thanh/flow-desk
set -a; source .env; set +a
export DATABASE_URL="postgresql://flowdesk:postgres@localhost:5432/flowdesk?schema=public"
export NODE_ENV=development
export PORT=3001
cd apps/api && pnpm exec tsx src/index.ts &
sleep 8
COOKIE=$(curl -s -i -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{"email":"demo@flow-desk.app","password":"demo1234"}' | grep -i 'set-cookie: access_token=' | sed 's/.*access_token=\([^;]*\).*/access_token=\1/')
WID=$(curl -s "http://localhost:3001/api/workspaces" -H "Cookie: $COOKIE" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).data[0].id))")
echo "wid: $WID"
# Create
curl -s -X POST "http://localhost:3001/api/workspaces/$WID/saved-filters" -H "Cookie: $COOKIE" -H 'Content-Type: application/json' -d '{"name":"Hot queue","query":{"status":"IN_REVIEW","priority":"HIGH"},"isShared":false}'
# List
curl -s "http://localhost:3001/api/workspaces/$WID/saved-filters" -H "Cookie: $COOKIE" | head -c 400
# Unauth
curl -s -o /dev/null -w "%{http_code}" "http://localhost:3001/api/workspaces/$WID/saved-filters"
# Expect: 401
kill %1 2>/dev/null
```

Record the actual output in the evidence field if it differs from the placeholders above.

- [ ] **Step 4: Append a session record to claude-progress.md**

Append to `claude-progress.md` (follow the existing session-record format):

```markdown
### Session 027 — P1-2 Saved Views / Filters

- **Date**: 2026-07-05
- **Goal**: Implement saved views / filters (ROADMAP.md Phase 1, item P1-2).
- **Completed**: SavedFilter model + soft-delete wiring; shared saved-filter schemas; saved-filter API module (repo/service/routes); 9 integration tests; web Save/Load/Manage UI wired into list page; 4 web component tests.
- **Verification**: pnpm verify green; live smoke 201 on create + 200 on list with cookie + 401 without.
- **Risks**: none new. Partial unique index on (workspaceId, userId, name) WHERE deletedAt IS NULL — Prisma can't express, enforced via raw SQL in migration.
- **Next**: P1-3 CSV export (ROADMAP.md Phase 1).
```

- [ ] **Step 5: Final commit**

```bash
cd /home/thanh/flow-desk
git add feature_list.json claude-progress.md
git commit -m "chore(saved-filter): mark P1-2 passing + session 027 record"
```

---

## Self-Review (run after writing, fix inline)

1. **Spec coverage**: ROADMAP P1-2 scope = `SavedFilter` model with id/userId/workspaceId/name/query/isShared/timestamps/deletedAt + @@index([workspaceId, userId]) (Task 1) ✓; CRUD GET/POST/PATCH/DELETE /api/workspaces/:id/saved-filters (Tasks 3-5) ✓; isShared visible to members, edit owner-only (Task 4 service + Task 6 tests) ✓; query JSON = existing list filter object shape (Task 2 savedFilterQuerySchema mirrors listTasksQuerySchema filter fields) ✓; Web save-current-filter button + named dropdown + manage dialog (Task 8) ✓; acceptance seed "filter by status=IN_REVIEW + priority=HIGH → save as Hot queue → reload → load → filters restored" covered by Task 6 create+list tests + Task 8 applySavedFilter wiring ✓.
2. **Placeholder scan**: one `<timestamp>` placeholder in Task 10 evidence — intentional (generated by `migrate dev --create-only` in Task 1, filled at commit time). All code blocks contain real code. No "TBD"/"add error handling"/"similar to Task N".
3. **Type consistency**: `SavedFilterRow` (repo) → `SavedFilter` (shared, Task 2) — shapes match. `savedFilterService.{list, create, update, remove}` signatures used identically in Task 5 routes. `useSavedFilters(workspaceId)` + `useCreateSavedFilter(workspaceId)` + `useUpdateSavedFilter(workspaceId)` + `useDeleteSavedFilter(workspaceId)` match Task 8 usage. `SaveFilterDialog` props `{open, onOpenChange, workspaceId, currentQuery}` match Task 8 list-page usage. `LoadFilterDropdown` props `{workspaceId, onApply, onManage}` match. `ManageFiltersDialog` props `{open, onOpenChange, workspaceId}` match.
4. **Gotcha coverage**: soft-delete covered by softDeleteExtension (Task 1 adds SavedFilter to SOFT_DELETE_MODELS) — documented in Global Constraints + Task 3 comments. Partial unique index can't be expressed in Prisma @@unique — documented in Task 1 + Task 2 notes + migration SQL comment. Ownership check (findOwnedById) ensures non-owners get 404 even on shared filters — documented in Task 4 + tested in Task 6.
