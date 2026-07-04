# Global Search (P1-1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add global full-text search across tasks, comments, and attachment filenames using PostgreSQL `tsvector` generated columns + GIN indexes, exposed via `GET /api/search?q=` and a Cmd+K palette in the web app.

**Architecture:** Three stored generated `tsvector` columns (one each on `Task`, `Comment`, `Attachment`) maintained by Postgres, not app code. A `search` API module (routes/service/repository split per AGENTS.md) issues raw `$queryRaw` that joins through `WorkspaceMember` for membership and manually filters `deletedAt IS NULL` (raw SQL bypasses the Prisma `softDeleteExtension`). Web feature module + `SearchPalette` dialog wired into `AppShell` with a Cmd+K listener.

**Tech Stack:** PostgreSQL 16 tsvector + GIN, Prisma 7.8 (`Unsupported("tsvector")` + raw SQL migration), Hono + Zod, TanStack Query, shadcn Dialog (already installed).

## Global Constraints

- Prisma can't model stored generated columns natively — use `Unsupported("tsvector")?` in `schema.prisma` + a `--create-only` migration with hand-edited SQL. Never write to `searchVector` (Postgres owns it).
- Raw SQL (`$queryRaw`) bypasses the `softDeleteExtension` (`apps/api/src/shared/lib/prisma-extension.ts`) — every search query MUST manually filter `deletedAt IS NULL` on `Task`/`Comment` and join `WorkspaceMember` for membership. This is the #1 gotcha.
- Schema hygiene checklist (AGENTS.md §Future-Sprint Schema Hygiene): no `board` in names; structural fields untouched beyond `columnId`/`parentTaskId`; query functions take `workspaceId`/`userId` as parameters, never hardcoded scope. Search is user-scoped (across all member workspaces), optional `workspaceId` filter — does NOT add structural fields.
- Module layout per AGENTS.md: `apps/api/src/modules/search/{search.routes,search.service,search.repository,search.test,index}.ts`; Zod schemas in `packages/shared/src/search.ts`; web feature at `apps/web/src/features/search/`.
- One feature `in_progress` in `feature_list.json` at a time.
- Web test ships with the feature (F8 pattern: `apps/web/src/components/ui/workspace-create-dialog.test.tsx` is the template).
- Search palettes don't paginate — `limit` (1-30, default 20), no offset. `ponytail: offset pagination deferred; palettes show top-N.`

---

## File Structure

**Backend (apps/api):**

- `packages/db/prisma/migrations/<timestamp>_search_tsvector/migration.sql` — Create: generated tsvector columns + GIN indexes on Task, Comment, Attachment.
- `packages/db/prisma/schema.prisma` — Modify: add `searchVector Unsupported("tsvector")?` to Task, Comment, Attachment.
- `apps/api/src/modules/search/search.repository.ts` — Create: raw SQL `searchTasks`/`searchComments`/`searchAttachments`.
- `apps/api/src/modules/search/search.service.ts` — Create: validate input, call repo, merge + rank + cap results.
- `apps/api/src/modules/search/search.routes.ts` — Create: `GET /api/search` with `requireAuth` + Zod query validation.
- `apps/api/src/modules/search/search.test.ts` — Create: unit tests for service (merge/rank/cap logic).
- `apps/api/src/modules/search/index.ts` — Create: public exports.
- `apps/api/src/app.ts` — Modify: register `searchRouter` at `/api/search`.
- `apps/api/tests/integration/search.test.ts` — Create: integration tests (hits, cross-workspace miss, soft-delete exclusion, membership).

**Shared (packages/shared):**

- `packages/shared/src/search.ts` — Create: `searchQuerySchema`, `searchResultSchema`, `searchResponseSchema`, types.
- `packages/shared/src/index.ts` — Modify: re-export search.
- `packages/shared/tsup.config.ts` — Modify: add `src/search.ts` entry.
- `packages/shared/package.json` — Modify: add `./search` export.

**Frontend (apps/web):**

- `apps/web/src/features/search/types.ts` — Create: `SearchResult` type.
- `apps/web/src/features/search/schemas.ts` — Create: response schema (re-uses shared).
- `apps/web/src/features/search/api.ts` — Create: `searchApi.search(q, limit?)`.
- `apps/web/src/features/search/hooks.ts` — Create: `useSearch` (debounced query).
- `apps/web/src/features/search/components/SearchPalette.tsx` — Create: Dialog + input + results + keyboard nav.
- `apps/web/src/features/search/components/SearchPalette.test.tsx` — Create: component test (F8 pattern).
- `apps/web/src/features/search/index.ts` — Create: public exports.
- `apps/web/src/components/layout/app-shell.tsx` — Modify: mount `SearchPalette` + Cmd+K listener + "Search" button.

**Artifacts:**

- `feature_list.json` — Modify: add `P1-1` entry, mark `in_progress` then `passing`.
- `claude-progress.md` — Modify: append session record.

---

### Task 1: Prisma migration — tsvector generated columns + GIN indexes

**Files:**

- Create: `packages/db/prisma/migrations/<timestamp>_search_tsvector/migration.sql`
- Modify: `packages/db/prisma/schema.prisma` (Task, Comment, Attachment models)

**Interfaces:**

- Produces: `Task.searchVector`, `Comment.searchVector`, `Attachment.searchVector` columns (read-only, Postgres-maintained). Used by Task 3's raw SQL.

- [ ] **Step 1: Create the migration file with --create-only**

Run:

```bash
cd /home/thanh/flow-desk
bash scripts/prisma-exec.sh migrate dev --name search_tsvector --create-only
```

Expected: a new directory `packages/db/prisma/migrations/<timestamp>_search_tsvector/` containing an empty `migration.sql`.

- [ ] **Step 2: Write the migration SQL**

Replace the contents of `packages/db/prisma/migrations/<timestamp>_search_tsvector/migration.sql` with:

```sql
-- AlterTable: add generated tsvector column on Task
ALTER TABLE "Task"
  ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
  ) STORED;

CREATE INDEX "Task_searchVector_idx" ON "Task" USING GIN ("searchVector");

-- AlterTable: add generated tsvector column on Comment
ALTER TABLE "Comment"
  ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(content, ''))
  ) STORED;

CREATE INDEX "Comment_searchVector_idx" ON "Comment" USING GIN ("searchVector");

-- AlterTable: add generated tsvector column on Attachment
ALTER TABLE "Attachment"
  ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(filename, ''))
  ) STORED;

CREATE INDEX "Attachment_searchVector_idx" ON "Attachment" USING GIN ("searchVector");
```

- [ ] **Step 3: Add Unsupported columns to schema.prisma**

In `packages/db/prisma/schema.prisma`, add `searchVector Unsupported("tsvector")?` to the three models. Place it after the existing scalar fields, before the relations.

In the `Task` model (after `labelsDeprecated` line, before `createdAt`):

```prisma
  labelsDeprecated String[]  @default([])
  searchVector    Unsupported("tsvector")? @map("searchVector")
  createdAt    DateTime     @default(now())
```

In the `Comment` model (after `editedAt`, before `createdAt`):

```prisma
  editedAt         DateTime?
  searchVector     Unsupported("tsvector")? @map("searchVector")
  createdAt        DateTime @default(now())
```

In the `Attachment` model (after `type`, before `storagePath`):

```prisma
  type         AttachmentType
  searchVector Unsupported("tsvector")? @map("searchVector")
  storagePath  String
```

- [ ] **Step 4: Apply the migration + regenerate client**

Run:

```bash
cd /home/thanh/flow-desk
bash scripts/prisma-exec.sh migrate dev
```

Expected: migration applied, `prisma generate` runs, no drift detected. If Prisma reports drift, re-run `bash scripts/prisma-exec.sh migrate dev` — the `--create-only` file from step 1 plus the schema edits from step 3 should now be consistent.

- [ ] **Step 5: Verify the generated columns exist and self-maintain**

Run (via the api container's postgres):

```bash
cd /home/thanh/flow-desk
docker compose exec -T postgres psql -U flowdesk -d flowdesk -c "INSERT INTO \"Task\" (id, \"workspaceId\", \"columnId\", title, \"createdById\", version) VALUES ('verify-tsvec-test', 'ws-test', 'col-test', 'Searchable report draft', 'user-test', 0) ON CONFLICT DO NOTHING; SELECT title, \"searchVector\" FROM \"Task\" WHERE id = 'verify-tsvec-test';"
```

Expected: the `searchVector` column shows a populated tsvector like `'draft':3 'report':2 'search':1` (lexemes derived from title). Then clean up:

```bash
docker compose exec -T postgres psql -U flowdesk -d flowdesk -c "DELETE FROM \"Task\" WHERE id = 'verify-tsvec-test';"
```

- [ ] **Step 6: Commit**

```bash
cd /home/thanh/flow-desk
git add packages/db/prisma/migrations/<timestamp>_search_tsvector/migration.sql packages/db/prisma/schema.prisma
git commit -m "feat(search): tsvector generated columns + GIN indexes on Task/Comment/Attachment"
```

---

### Task 2: Shared search schemas

**Files:**

- Create: `packages/shared/src/search.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/tsup.config.ts`
- Modify: `packages/shared/package.json`

**Interfaces:**

- Produces: `searchQuerySchema`, `searchResultSchema`, `searchResponseSchema`, `SearchQuery`, `SearchResult`, `SearchResponse` (consumed by Task 4 service, Task 5 routes, Task 7 web).
- Consumes: `cuidSchema` from `./common`.

- [ ] **Step 1: Write the schemas**

Create `packages/shared/src/search.ts`:

```ts
import { z } from 'zod';
import { cuidSchema } from './common';

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(200).trim(),
  workspaceId: cuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(30).default(20),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const searchResultSchema = z.object({
  type: z.enum(['task', 'comment', 'attachment']),
  id: cuidSchema,
  workspaceId: cuidSchema,
  taskId: cuidSchema,
  title: z.string(),
  rank: z.number(),
});
export type SearchResult = z.infer<typeof searchResultSchema>;

export const searchResponseSchema = z.object({
  data: z.array(searchResultSchema),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;
```

- [ ] **Step 2: Re-export from index**

In `packages/shared/src/index.ts`, add to the existing re-exports (append one line):

```ts
export * from './search';
```

- [ ] **Step 3: Add tsup entry**

In `packages/shared/tsup.config.ts`, add `'src/search.ts'` to the `entry` array (after `'src/notification-preferences.ts'`):

```ts
    'src/notification-preferences.ts',
    'src/search.ts',
  ],
```

- [ ] **Step 4: Add package.json export**

In `packages/shared/package.json`, add a `./search` entry inside `exports` (after the `./notification-preferences` entry):

```json
    "./notification-preferences": {
      "types": "./dist/notification-preferences.d.ts",
      "import": "./dist/notification-preferences.mjs",
      "require": "./dist/notification-preferences.js"
    },
    "./search": {
      "types": "./dist/search.d.ts",
      "import": "./dist/search.mjs",
      "require": "./dist/search.js"
    }
```

- [ ] **Step 5: Build + verify**

Run:

```bash
cd /home/thanh/flow-desk
pnpm --filter @flow-desk/shared build
pnpm --filter @flow-desk/shared typecheck
```

Expected: both exit 0, `dist/search.{js,mjs,d.ts}` exist.

- [ ] **Step 6: Commit**

```bash
cd /home/thanh/flow-desk
git add packages/shared/src/search.ts packages/shared/src/index.ts packages/shared/tsup.config.ts packages/shared/package.json
git commit -m "feat(shared): search Zod schemas + export wiring"
```

---

### Task 3: Search repository (raw SQL with membership + soft-delete filter)

**Files:**

- Create: `apps/api/src/modules/search/search.repository.ts`

**Interfaces:**

- Consumes: `prisma` from `../../shared/lib/prisma`.
- Produces: `searchTasks(prisma, { q, userId, workspaceId?, limit })`, `searchComments(...)`, `searchAttachments(...)` — each returns `SearchResultRow[]` where `SearchResultRow = { type, id, workspaceId, taskId, title, rank }`. Consumed by Task 4 service.

- [ ] **Step 1: Write the repository**

Create `apps/api/src/modules/search/search.repository.ts`:

```ts
import { prisma } from '../../shared/lib/prisma';

export interface SearchInput {
  q: string;
  userId: string;
  workspaceId?: string;
  limit: number;
}

export interface SearchResultRow {
  type: 'task' | 'comment' | 'attachment';
  id: string;
  workspaceId: string;
  taskId: string;
  title: string;
  rank: number;
}

// Raw SQL bypasses the softDeleteExtension — manually filter deletedAt IS NULL
// and join WorkspaceMember for membership. workspaceId is bound as a nullable
// parameter: ($ws::text IS NULL OR ...) keeps it fully parameterized (no
// rawUnsafe, no interpolation surface). ponytail: offset pagination deferred;
// palettes show top-N, so LIMIT only.
export async function searchTasks(
  p: typeof prisma,
  input: SearchInput,
): Promise<SearchResultRow[]> {
  const ws = input.workspaceId ?? null;
  const rows = await p.$queryRaw<SearchResultRow[]>`
    SELECT
      'task' AS type,
      t.id AS id,
      t."workspaceId" AS "workspaceId",
      t.id AS "taskId",
      t.title AS title,
      ts_rank(t."searchVector", q) AS rank
    FROM "Task" t, plainto_tsquery('english', ${input.q}) q
    WHERE t."searchVector" @@ q
      AND t."deletedAt" IS NULL
      AND (${ws}::text IS NULL OR t."workspaceId" = ${ws})
      AND EXISTS (
        SELECT 1 FROM "WorkspaceMember" m
        WHERE m."workspaceId" = t."workspaceId" AND m."userId" = ${input.userId}
      )
    ORDER BY rank DESC, t."createdAt" DESC
    LIMIT ${input.limit}
  `;
  return rows;
}

export async function searchComments(
  p: typeof prisma,
  input: SearchInput,
): Promise<SearchResultRow[]> {
  const ws = input.workspaceId ?? null;
  const rows = await p.$queryRaw<SearchResultRow[]>`
    SELECT
      'comment' AS type,
      c.id AS id,
      t."workspaceId" AS "workspaceId",
      t.id AS "taskId",
      LEFT(c.content, 200) AS title,
      ts_rank(c."searchVector", q) AS rank
    FROM "Comment" c, plainto_tsquery('english', ${input.q}) q
    JOIN "Task" t ON t.id = c."taskId"
    WHERE c."searchVector" @@ q
      AND c."deletedAt" IS NULL
      AND t."deletedAt" IS NULL
      AND (${ws}::text IS NULL OR t."workspaceId" = ${ws})
      AND EXISTS (
        SELECT 1 FROM "WorkspaceMember" m
        WHERE m."workspaceId" = t."workspaceId" AND m."userId" = ${input.userId}
      )
    ORDER BY rank DESC, c."createdAt" DESC
    LIMIT ${input.limit}
  `;
  return rows;
}

export async function searchAttachments(
  p: typeof prisma,
  input: SearchInput,
): Promise<SearchResultRow[]> {
  const ws = input.workspaceId ?? null;
  const rows = await p.$queryRaw<SearchResultRow[]>`
    SELECT
      'attachment' AS type,
      a.id AS id,
      t."workspaceId" AS "workspaceId",
      t.id AS "taskId",
      a.filename AS title,
      ts_rank(a."searchVector", q) AS rank
    FROM "Attachment" a, plainto_tsquery('english', ${input.q}) q
    JOIN "Task" t ON t.id = a."taskId"
    WHERE a."searchVector" @@ q
      AND t."deletedAt" IS NULL
      AND (${ws}::text IS NULL OR t."workspaceId" = ${ws})
      AND EXISTS (
        SELECT 1 FROM "WorkspaceMember" m
        WHERE m."workspaceId" = t."workspaceId" AND m."userId" = ${input.userId}
      )
    ORDER BY rank DESC, a."createdAt" DESC
    LIMIT ${input.limit}
  `;
  return rows;
}
```

The user-supplied `q` and `userId` are always parameterized via `${...}` (never interpolated). `workspaceId` is validated as `cuidSchema` by the route (Task 5) and bound here as a nullable parameter — the `(${ws}::text IS NULL OR ...)` pattern means `null` widens to "all member workspaces" and a real cuid scopes to one. No `$rawUnsafe`, no string concatenation, no injection surface.

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
git add apps/api/src/modules/search/search.repository.ts
git commit -m "feat(search): repository — raw SQL search with membership + soft-delete filter"
```

---

### Task 4: Search service (merge + rank + cap)

**Files:**

- Create: `apps/api/src/modules/search/search.service.ts`
- Create: `apps/api/src/modules/search/index.ts`

**Interfaces:**

- Consumes: `searchTasks`/`searchComments`/`searchAttachments` from `./search.repository`, `SearchQuery` from `@flow-desk/shared/search`.
- Produces: `searchService.search(userId, query)` → `{ data: SearchResult[] }`. Consumed by Task 5 routes.

- [ ] **Step 1: Write the service**

Create `apps/api/src/modules/search/search.service.ts`:

```ts
import { prisma } from '../../shared/lib/prisma';
import * as repo from './search.repository';
import type { SearchQuery, SearchResult } from '@flow-desk/shared/search';

export async function search(
  userId: string,
  query: SearchQuery,
): Promise<{ data: SearchResult[] }> {
  const input = { q: query.q, userId, workspaceId: query.workspaceId, limit: query.limit };
  const [tasks, comments, attachments] = await Promise.all([
    repo.searchTasks(prisma, input),
    repo.searchComments(prisma, input),
    repo.searchAttachments(prisma, input),
  ]);
  const merged = [...tasks, ...comments, ...attachments].sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    return a.title.localeCompare(a.title);
  });
  const data = merged.slice(0, query.limit).map((row) => ({
    type: row.type,
    id: row.id,
    workspaceId: row.workspaceId,
    taskId: row.taskId,
    title: row.title,
    rank: Number(row.rank),
  }));
  return { data };
}

export const searchService = { search };
```

- [ ] **Step 2: Write the index**

Create `apps/api/src/modules/search/index.ts`:

```ts
export { searchService } from './search.service';
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
git add apps/api/src/modules/search/search.service.ts apps/api/src/modules/search/index.ts
git commit -m "feat(search): service — merge + rank + cap results"
```

---

### Task 5: Search routes + register in app.ts

**Files:**

- Create: `apps/api/src/modules/search/search.routes.ts`
- Modify: `apps/api/src/app.ts` (register router)

**Interfaces:**

- Consumes: `searchService` from `./search.service`, `searchQuerySchema` + `searchResponseSchema` from `@flow-desk/shared/search`, `requireAuth` from `../../shared/middleware/auth`.
- Produces: `GET /api/search?q=&limit=&workspaceId=` → `{ data: SearchResult[] }`.

- [ ] **Step 1: Write the routes**

Create `apps/api/src/modules/search/search.routes.ts`:

```ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { searchQuerySchema, searchResponseSchema } from '@flow-desk/shared/search';
import { requireAuth } from '../../shared/middleware/auth';
import { searchService } from './search.service';

export const searchRouter = new Hono();
searchRouter.use('*', requireAuth());

searchRouter.get(
  '/',
  zValidator('query', searchQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json({ code: 'INVALID_QUERY', details: result.error.flatten() }, 400);
    }
    return undefined;
  }),
  async (c) => {
    const auth = c.get('auth');
    const query = c.req.valid('query');
    const result = await searchService.search(auth.user.id, query);
    return c.json(searchResponseSchema.parse(result));
  },
);
```

- [ ] **Step 2: Register the router in app.ts**

In `apps/api/src/app.ts`, add the import (after the `prefsRouter` import):

```ts
import { searchRouter } from './modules/search/search.routes';
```

And register the route (after `app.route('/api/notification-preferences', prefsRouter);`):

```ts
app.route('/api/search', searchRouter);
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
git add apps/api/src/modules/search/search.routes.ts apps/api/src/app.ts
git commit -m "feat(search): GET /api/search route + register in app"
```

---

### Task 6: Backend integration tests

**Files:**

- Create: `apps/api/tests/integration/search.test.ts`
- Modify: `apps/api/tests/setup/factories.ts` (add `createComment` + `createAttachment` helpers)

**Interfaces:**

- Consumes: `buildApp` from `../../src/app`, factories from `../setup/factories`, `getTestPrisma` from `../setup/integration`.

- [ ] **Step 1: Add comment + attachment factories**

In `apps/api/tests/setup/factories.ts`, append these helpers (after `getAuthCookie`):

```ts
export async function createComment(
  prisma: PrismaClient,
  taskId: string,
  authorId: string,
  content: string = 'Test comment',
): Promise<{ id: string; content: string }> {
  const c = await prisma.comment.create({
    data: { taskId, authorId, content },
  });
  return { id: c.id, content: c.content };
}

export async function createAttachment(
  prisma: PrismaClient,
  taskId: string,
  uploadedById: string,
  filename: string = 'report.pdf',
): Promise<{ id: string; filename: string }> {
  const a = await prisma.attachment.create({
    data: {
      taskId,
      uploadedById,
      filename,
      mimeType: 'application/pdf',
      size: 1024,
      type: 'DOCUMENT',
      storagePath: `/data/${filename}`,
    },
  });
  return { id: a.id, filename: a.filename };
}
```

- [ ] **Step 2: Write the failing integration test**

Create `apps/api/tests/integration/search.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getTestPrisma } from '../setup/integration';
import {
  cleanDatabase,
  createUser,
  createWorkspace,
  addMember,
  createTask,
  createComment,
  createAttachment,
  getAuthCookie,
} from '../setup/factories';
import { buildApp } from '../../src/app';

describe('GET /api/search (P1-1)', () => {
  let prisma: ReturnType<typeof getTestPrisma>;

  beforeEach(async () => {
    prisma = getTestPrisma();
    await cleanDatabase(prisma);
  });

  async function setup() {
    const owner = await createUser(prisma);
    const w = await createWorkspace(prisma, owner.id, 'Search WS');
    const cols = await prisma.column.findMany({
      where: { workspaceId: w.id },
      orderBy: { position: 'asc' },
    });
    const todoCol = cols.find((c) => c.name === 'Todo')!;
    const cookie = await getAuthCookie(prisma, owner.id);
    return { ownerId: owner.id, wid: w.id, colId: todoCol.id, cookie };
  }

  it('returns tasks matching the query', async () => {
    const { ownerId, wid, colId, cookie } = await setup();
    await createTask(prisma, wid, colId, ownerId, 'Quarterly report draft');
    await createTask(prisma, wid, colId, ownerId, 'Unrelated chore');
    const app = buildApp();
    const res = await app.request('/api/search?q=report', {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].type).toBe('task');
    expect(body.data[0].title).toContain('report');
  });

  it('returns comments matching the query', async () => {
    const { ownerId, wid, colId, cookie } = await setup();
    const t = await createTask(prisma, wid, colId, ownerId, 'Task X');
    await createComment(prisma, t.id, ownerId, 'The budget breakdown looks off');
    const app = buildApp();
    const res = await app.request('/api/search?q=budget', {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const commentHits = body.data.filter((r: { type: string }) => r.type === 'comment');
    expect(commentHits).toHaveLength(1);
    expect(commentHits[0].taskId).toBe(t.id);
  });

  it('returns attachments matching the filename', async () => {
    const { ownerId, wid, colId, cookie } = await setup();
    const t = await createTask(prisma, wid, colId, ownerId, 'Task Y');
    await createAttachment(prisma, t.id, ownerId, 'invoice-2026.xlsx');
    const app = buildApp();
    const res = await app.request('/api/search?q=invoice', {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const attHits = body.data.filter((r: { type: string }) => r.type === 'attachment');
    expect(attHits).toHaveLength(1);
    expect(attHits[0].title).toBe('invoice-2026.xlsx');
  });

  it('excludes results from workspaces the user is not a member of', async () => {
    const { ownerId, wid, colId } = await setup();
    const outsider = await createUser(prisma, 'outsider@test.local', 'Outsider');
    const outsiderCookie = await getAuthCookie(prisma, outsider.id);
    await createTask(prisma, wid, colId, ownerId, 'Secret report');
    const app = buildApp();
    const res = await app.request('/api/search?q=secret', {
      headers: { Cookie: outsiderCookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  it('excludes soft-deleted tasks', async () => {
    const { ownerId, wid, colId, cookie } = await setup();
    const t = await createTask(prisma, wid, colId, ownerId, 'Deleted report');
    await prisma.task.update({ where: { id: t.id }, data: { deletedAt: new Date() } });
    const app = buildApp();
    const res = await app.request('/api/search?q=report', {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  it('scopes to workspaceId when provided', async () => {
    const owner = await createUser(prisma);
    const w1 = await createWorkspace(prisma, owner.id, 'WS One');
    const w2 = await createWorkspace(prisma, owner.id, 'WS Two');
    const cols1 = await prisma.column.findMany({ where: { workspaceId: w1.id } });
    const cols2 = await prisma.column.findMany({ where: { workspaceId: w2.id } });
    await createTask(prisma, w1.id, cols1[0].id, owner.id, 'Shared keyword report');
    await createTask(prisma, w2.id, cols2[0].id, owner.id, 'Shared keyword report');
    const cookie = await getAuthCookie(prisma, owner.id);
    const app = buildApp();
    const res = await app.request(`/api/search?q=report&workspaceId=${w1.id}`, {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].workspaceId).toBe(w1.id);
  });

  it('rejects empty query with 400', async () => {
    const { cookie } = await setup();
    const app = buildApp();
    const res = await app.request('/api/search?q=', {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(400);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const app = buildApp();
    const res = await app.request('/api/search?q=anything');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 3: Run the integration tests (expect pass — repo + service already written)**

Run:

```bash
cd /home/thanh/flow-desk
pnpm --filter @flow-desk/api test:integration -- search
```

Expected: 8 tests pass. If the soft-deleted task test fails, confirm the raw SQL in `search.repository.ts` filters `t."deletedAt" IS NULL` (it does — re-check the conditional workspaceId branch didn't break the WHERE clause).

Note: integration tests need postgres + redis. If not running, start them: `docker compose up -d postgres redis`. The test DB is `flowdesk_test` — the migration from Task 1 must be applied to it. Run `bash scripts/prisma-exec.sh migrate deploy` first if the test DB is fresh.

- [ ] **Step 4: Run the full integration suite (regression check)**

Run:

```bash
cd /home/thanh/flow-desk
pnpm --filter @flow-desk/api test:integration
```

Expected: all tests pass (existing 200+ plus 8 new).

- [ ] **Step 5: Commit**

```bash
cd /home/thanh/flow-desk
git add apps/api/tests/integration/search.test.ts apps/api/tests/setup/factories.ts
git commit -m "test(search): integration tests — hits, membership, soft-delete, scoping"
```

---

### Task 7: Web search feature (api + hooks + types)

**Files:**

- Create: `apps/web/src/features/search/types.ts`
- Create: `apps/web/src/features/search/schemas.ts`
- Create: `apps/web/src/features/search/api.ts`
- Create: `apps/web/src/features/search/hooks.ts`
- Create: `apps/web/src/features/search/index.ts`

**Interfaces:**

- Consumes: `SearchResult`, `searchResponseSchema` from `@flow-desk/shared/search`, `api` from `@/lib/api`.
- Produces: `searchApi.search(q, limit?)`, `useSearch(q, enabled)`, `searchKeys`, `SearchResult` type. Consumed by Task 8 `SearchPalette`.

- [ ] **Step 1: Write types**

Create `apps/web/src/features/search/types.ts`:

```ts
import type { SearchResult } from '@flow-desk/shared/search';
export type { SearchResult };
```

- [ ] **Step 2: Write schemas**

Create `apps/web/src/features/search/schemas.ts`:

```ts
import { searchResponseSchema } from '@flow-desk/shared/search';
export { searchResponseSchema };
```

- [ ] **Step 3: Write the API client**

Create `apps/web/src/features/search/api.ts`:

```ts
import type { SearchResult } from '@flow-desk/shared/search';
import { api } from '@/lib/api';
import { searchResponseSchema } from './schemas';

export const searchApi = {
  search(q: string, limit = 20) {
    const qs = `?q=${encodeURIComponent(q)}&limit=${limit}`;
    return api<{ data: SearchResult[] }>(`/api/search${qs}`, {
      schema: searchResponseSchema,
    });
  },
};
```

- [ ] **Step 4: Write the debounced search hook**

Create `apps/web/src/features/search/hooks.ts`:

```ts
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { searchApi } from './api';

export const searchKeys = {
  list: (q: string) => ['search', q] as const,
};

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function useSearch(q: string, enabled = true) {
  const debounced = useDebouncedValue(q, 200);
  return useQuery({
    queryKey: searchKeys.list(debounced),
    queryFn: () => searchApi.search(debounced),
    enabled: enabled && debounced.trim().length > 0,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}
```

- [ ] **Step 5: Write the index**

Create `apps/web/src/features/search/index.ts`:

```ts
export { searchApi } from './api';
export { useSearch, searchKeys } from './hooks';
export type { SearchResult } from './types';
export { SearchPalette } from './components/SearchPalette';
```

- [ ] **Step 6: Typecheck**

Run:

```bash
cd /home/thanh/flow-desk
pnpm --filter @flow-desk/web typecheck
```

Expected: exit 0 (the `SearchPalette` import in index.ts will fail typecheck until Task 8 creates it — if you run typecheck now, expect one error about a missing module. Proceed to Task 8 and re-run; or temporarily comment the `SearchPalette` export line and uncomment after Task 8).

- [ ] **Step 7: Commit**

```bash
cd /home/thanh/flow-desk
git add apps/web/src/features/search/
git commit -m "feat(web/search): api client + debounced useSearch hook + types"
```

---

### Task 8: SearchPalette component + wire into AppShell

**Files:**

- Create: `apps/web/src/features/search/components/SearchPalette.tsx`
- Modify: `apps/web/src/components/layout/app-shell.tsx` (mount palette + Cmd+K listener + Search button)

**Interfaces:**

- Consumes: `useSearch` from `../hooks`, `SearchResult` from `../types`, shadcn `Dialog`, `Input`, `Button`, `Avatar` from `@/components/ui/*`, `useNavigate` from `react-router-dom`.
- Produces: `SearchPalette` (controlled open/onOpenChange) — renders a Dialog with search input, debounced results list, keyboard nav (up/down/enter), click-to-navigate.

- [ ] **Step 1: Write the SearchPalette component**

Create `apps/web/src/features/search/components/SearchPalette.tsx`:

```tsx
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, MessageSquare, Paperclip } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useSearch } from '../hooks';
import type { SearchResult } from '../types';

interface SearchPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TYPE_ICON = {
  task: FileText,
  comment: MessageSquare,
  attachment: Paperclip,
} as const;

export function SearchPalette({ open, onOpenChange }: SearchPaletteProps) {
  const navigate = useNavigate();
  const [q, setQ] = React.useState('');
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { data, isLoading } = useSearch(q, open);
  const results = data?.data ?? [];

  React.useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      // focus input after dialog mounts
      const id = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
  }, [open]);

  React.useEffect(() => {
    setActive(0);
  }, [q]);

  function goTo(r: SearchResult) {
    onOpenChange(false);
    // task → board; comment/attachment → board (task highlighted by navigation)
    navigate(`/board/${r.workspaceId}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[active];
      if (r) goTo(r);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Search tasks, comments, and attachments</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search className="size-4 text-muted-foreground" aria-hidden />
          <Input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search tasks, comments, attachments…"
            className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
            aria-label="Search query"
            aria-autocomplete="list"
            aria-controls="search-results"
          />
        </div>
        <ul
          id="search-results"
          role="listbox"
          aria-label="Search results"
          className="max-h-80 overflow-y-auto p-1"
        >
          {isLoading && q.trim() ? (
            <li className="px-3 py-4 text-sm text-muted-foreground">Searching…</li>
          ) : results.length === 0 && q.trim() ? (
            <li className="px-3 py-4 text-sm text-muted-foreground">No matches.</li>
          ) : results.length === 0 ? (
            <li className="px-3 py-4 text-sm text-muted-foreground">
              Type to search across your workspaces.
            </li>
          ) : (
            results.map((r, i) => {
              const Icon = TYPE_ICON[r.type];
              return (
                <li key={`${r.type}-${r.id}`} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => goTo(r)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm',
                      i === active ? 'bg-primary/10 text-primary' : 'hover:bg-muted',
                    )}
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{r.title}</span>
                    <span className="shrink-0 text-xs uppercase tracking-wider text-muted-foreground">
                      {r.type}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
```

Note: `Input` is the shadcn input at `apps/web/src/components/ui/input.tsx`. Confirm it exists; if not, run `pnpm --filter @flow-desk/web exec shadcn add input` before this step.

- [ ] **Step 2: Verify Input component exists**

Run:

```bash
cd /home/thanh/flow-desk
ls apps/web/src/components/ui/input.tsx
```

Expected: file exists. If missing, run `pnpm --filter @flow-desk/web exec shadcn add input` and commit that addition separately first.

- [ ] **Step 3: Wire SearchPalette + Cmd+K into AppShell**

In `apps/web/src/components/layout/app-shell.tsx`:

Add imports (after the `WorkspaceCreateDialog` import):

```tsx
import { Search as SearchIcon } from 'lucide-react';
import { SearchPalette } from '@/features/search';
```

Inside `AppShell()`, after `const [createOpen, setCreateOpen] = React.useState(false);` add:

```tsx
const [searchOpen, setSearchOpen] = React.useState(false);

React.useEffect(() => {
  function onKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      setSearchOpen(true);
    }
  }
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, []);
```

In the sidebar header block (after the `WorkspaceSwitcher` JSX, inside the `<div className="flex flex-col gap-3 px-4 py-4">`), add a Search button:

```tsx
<button
  type="button"
  onClick={() => setSearchOpen(true)}
  className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
  aria-label="Open search (Ctrl+K)"
>
  <SearchIcon className="size-4" aria-hidden />
  <span>Search…</span>
  <kbd className="ml-auto text-xs">⌘K</kbd>
</button>
```

Finally, render the palette next to the `WorkspaceCreateDialog` at the end of the component (after the `</main>` and before closing `</div>`):

```tsx
<SearchPalette open={searchOpen} onOpenChange={setSearchOpen} />
```

- [ ] **Step 4: Typecheck + build**

Run:

```bash
cd /home/thanh/flow-desk
pnpm --filter @flow-desk/web typecheck
pnpm --filter @flow-desk/web build
```

Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
cd /home/thanh/flow-desk
git add apps/web/src/features/search/components/SearchPalette.tsx apps/web/src/components/layout/app-shell.tsx
git commit -m "feat(web/search): SearchPalette (Cmd+K) + wire into AppShell"
```

---

### Task 9: Web component test (F8 pattern)

**Files:**

- Create: `apps/web/src/features/search/components/SearchPalette.test.tsx`

**Interfaces:**

- Consumes: `SearchPalette` from `./SearchPalette`, vitest + @testing-library/react, `@/lib/api` mock.

- [ ] **Step 1: Write the component test**

Create `apps/web/src/features/search/components/SearchPalette.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SearchPalette } from './SearchPalette';

const mockSearch = vi.fn();
vi.mock('@/lib/api', () => ({
  api: vi.fn((...args: unknown[]) => mockSearch(...args)),
}));

function renderPalette(open = true, onOpenChange = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <SearchPalette open={open} onOpenChange={onOpenChange} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SearchPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the search input when open', () => {
    renderPalette();
    expect(screen.getByRole('textbox', { name: 'Search query' })).toBeInTheDocument();
  });

  it('shows "Type to search" prompt before any input', () => {
    renderPalette();
    expect(screen.getByText('Type to search across your workspaces.')).toBeInTheDocument();
  });

  it('debounces then shows results', async () => {
    mockSearch.mockResolvedValue({
      data: [
        {
          type: 'task',
          id: 't1',
          workspaceId: 'ws1',
          taskId: 't1',
          title: 'Report draft',
          rank: 0.5,
        },
      ],
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPalette();
    const input = screen.getByRole('textbox', { name: 'Search query' });
    await user.type(input, 'report');
    vi.advanceTimersByTime(250);
    await waitFor(() =>
      expect(mockSearch).toHaveBeenCalledWith('/api/search?q=report&limit=20', expect.anything()),
    );
    await waitFor(() => expect(screen.getByText('Report draft')).toBeInTheDocument());
  });

  it('renders the no-matches message when API returns empty', async () => {
    mockSearch.mockResolvedValue({ data: [] });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPalette();
    const input = screen.getByRole('textbox', { name: 'Search query' });
    await user.type(input, 'zzz');
    vi.advanceTimersByTime(250);
    await waitFor(() => expect(screen.getByText('No matches.')).toBeInTheDocument());
  });
});
```

Note: if fake timers conflict with TanStack Query, drop `vi.useFakeTimers` and instead test the non-debounced path by asserting `mockSearch` was called after a `waitFor`. The F8 template (`workspace-create-dialog.test.tsx`) uses real timers — mirror it if fake timers prove flaky.

- [ ] **Step 2: Run the web tests**

Run:

```bash
cd /home/thanh/flow-desk
pnpm --filter @flow-desk/web test -- --run
```

Expected: all web tests pass (existing 10 + new 4 = 14). If the debounce test is flaky, simplify per the note above.

- [ ] **Step 3: Commit**

```bash
cd /home/thanh/flow-desk
git add apps/web/src/features/search/components/SearchPalette.test.tsx
git commit -m "test(web/search): SearchPalette component tests (F8 pattern)"
```

---

### Task 10: Update feature_list.json + claude-progress.md + verify

**Files:**

- Modify: `feature_list.json`
- Modify: `claude-progress.md`

**Interfaces:**

- Consumes: the `P1-1` entry spec from `ROADMAP.md`.

- [ ] **Step 1: Add the P1-1 entry to feature_list.json**

Open `feature_list.json`. Add this entry to the end of the `features` array (before the closing `]`), and ensure no other feature is `in_progress`:

```json
{
  "id": "P1-1",
  "priority": 90,
  "area": "search",
  "title": "Global full-text search across tasks, comments, and attachments",
  "user_visible_behavior": "User presses Cmd/Ctrl+K anywhere in the app and types a query; a palette shows matching tasks (by title/description), comments (by content), and attachments (by filename) across all workspaces they are a member of. Clicking a result navigates to its workspace board. GET /api/search?q=&limit=&workspaceId= returns ranked results; cross-workspace access is rejected for non-members; soft-deleted tasks/comments are excluded.",
  "status": "passing",
  "verification": [
    "pnpm --filter @flow-desk/shared build → exit 0",
    "pnpm --filter @flow-desk/api typecheck → exit 0",
    "pnpm --filter @flow-desk/api test:integration -- search → 8/8 pass",
    "pnpm --filter @flow-desk/api test:integration → all pass (no regression)",
    "pnpm --filter @flow-desk/web typecheck → exit 0",
    "pnpm --filter @flow-desk/web build → exit 0",
    "pnpm --filter @flow-desk/web test -- --run → all pass (incl. 4 new SearchPalette tests)",
    "curl 'http://localhost:3000/api/search?q=report' with auth cookie → 200, { data: [...] }",
    "curl 'http://localhost:3000/api/search?q=report' without cookie → 401"
  ],
  "evidence": [
    "packages/db/prisma/migrations/<timestamp>_search_tsvector/migration.sql — GENERATED ALWAYS AS ... STORED tsvector on Task/Comment/Attachment + GIN indexes",
    "packages/db/prisma/schema.prisma — searchVector Unsupported(\"tsvector\")? on three models",
    "packages/shared/src/search.ts — searchQuerySchema, searchResultSchema, searchResponseSchema",
    "apps/api/src/modules/search/{search.repository,search.service,search.routes,index}.ts — raw SQL with membership join + deletedAt IS NULL filter",
    "apps/api/src/app.ts — app.route('/api/search', searchRouter)",
    "apps/api/tests/integration/search.test.ts — 8 integration tests (task/comment/attachment hits, cross-workspace miss, soft-delete exclusion, workspaceId scope, empty query 400, unauth 401)",
    "apps/web/src/features/search/ — types, schemas, api, hooks (useSearch with 200ms debounce), SearchPalette, component test, index",
    "apps/web/src/components/layout/app-shell.tsx — SearchPalette mounted + Cmd/Ctrl+K listener + Search button in sidebar"
  ],
  "notes": "Phase 1 item P1-1 from ROADMAP.md. tsvector columns are GENERATED ALWAYS AS ... STORED (Postgres-maintained, no app triggers). Raw SQL bypasses softDeleteExtension — queries manually filter deletedAt IS NULL + join WorkspaceMember. Search is user-scoped (all member workspaces), optional workspaceId filter. No offset pagination (palettes show top-N; ponytail: offset deferred). Schema hygiene checklist respected: no board-in-names, no new structural fields on Task."
}
```

Replace `<timestamp>` in the evidence with the actual migration directory name from Task 1.

- [ ] **Step 2: Run the full verify gate**

Run:

```bash
cd /home/thanh/flow-desk
pnpm verify
```

Expected: exit 0 (typecheck + lint + unit tests + integration tests + web build all green). If `pnpm verify` doesn't exist, run the components individually: `pnpm -r typecheck && pnpm -r lint && pnpm --filter @flow-desk/api test && pnpm --filter @flow-desk/api test:integration && pnpm --filter @flow-desk/web test -- --run && pnpm --filter @flow-desk/web build`.

- [ ] **Step 3: Live smoke against the running stack**

If the stack isn't up:

```bash
cd /home/thanh/flow-desk
docker compose up -d
bash scripts/prisma-exec.sh migrate deploy
```

Then:

```bash
# Login as demo user
COOKIE=$(curl -s -i -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"demo@flow-desk.app","password":"demo1234"}' | grep -i 'set-cookie: access_token=' | sed 's/.*access_token=\([^;]*\).*/access_token=\1/')
# Search
curl -s "http://localhost:3000/api/search?q=report" -H "Cookie: $COOKIE" | head -c 500
# Expect: {"data":[{"type":"task","id":"...","workspaceId":"...","taskId":"...","title":"...report...","rank":...}, ...]}
# Unauth
curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/api/search?q=report"
# Expect: 401
```

Record the actual output in the evidence field if it differs from the placeholders above.

- [ ] **Step 4: Append a session record to claude-progress.md**

Append to `claude-progress.md` (follow the existing session-record format):

```markdown
### Session 026 — P1-1 Global Search

- **Date**: 2026-07-05
- **Goal**: Implement global full-text search (ROADMAP.md Phase 1, item P1-1).
- **Completed**: tsvector generated columns + GIN on Task/Comment/Attachment; shared search schemas; search API module (repo/service/routes); 8 integration tests; web SearchPalette with Cmd+K + debounce + keyboard nav; 4 web component tests; AppShell wiring.
- **Verification**: pnpm verify green; live smoke 200 with cookie + 401 without.
- **Risks**: none new. Raw SQL soft-delete filter is the documented gotcha (R-29 mitigation extended to search).
- **Next**: P1-2 Saved views/filters (ROADMAP.md Phase 1).
```

- [ ] **Step 5: Final commit**

```bash
cd /home/thanh/flow-desk
git add feature_list.json claude-progress.md
git commit -m "chore(search): mark P1-1 passing + session record"
```

---

## Self-Review (run after writing, fix inline — already applied)

1. **Spec coverage**: ROADMAP P1-1 scope = tsvector generated column + GIN (Task 1) ✓; `GET /api/search?q=` (Tasks 2-5) ✓; workspace membership enforced (Task 3 SQL + Task 6 test) ✓; Cmd+K palette (Tasks 7-8) ✓; web component test F8 pattern (Task 9) ✓; feature_list.json update (Task 10) ✓. Attachment filename indexing covered (Task 1 + Task 6 test). Cross-workspace rejection covered (Task 6 test).
2. **Placeholder scan**: one `<timestamp>` placeholder in Task 10 evidence — intentional (the timestamp is generated by `migrate dev --create-only` in Task 1 and must be filled by the implementer at commit time). All code blocks contain real code. No "TBD"/"add error handling"/"similar to Task N".
3. **Type consistency**: `SearchResultRow` (repo) → `SearchResult` (shared, Task 2) — shapes match (`type/id/workspaceId/taskId/title/rank`). `searchService.search(userId, query)` signature used identically in Task 5 route. `useSearch(q, enabled)` matches Task 8 usage. `SearchPalette` props `{open, onOpenChange}` match Task 8 AppShell usage.
4. **Gotcha coverage**: softDeleteExtension bypass documented in Global Constraints + Task 3 comments + tested in Task 6. Generated-column Prisma limitation documented + worked around with `Unsupported("tsvector")`. workspaceId SQL injection guarded (cuid validation + quote-escape).
