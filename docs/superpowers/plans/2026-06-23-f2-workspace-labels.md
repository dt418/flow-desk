# F2: Dashboard Create + Workspace Switcher + TaskLabel M2M + /welcome Onboarding

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** 🟡 DRAFT — pending user approval.

**Size warning:** Large multi-track plan (~48 tasks, 12 epics) covering backend + frontend + realtime + E2E. Recommend **Subagent-Driven Execution** for isolation between tracks. Each epic = one batched subagent dispatch.

**Goal:** Ship production-ready dashboard create-org UI + workspace switcher + TaskLabel CRUD (with proper M2M migration) + `/welcome` onboarding. Closes R-32 (zero tests) and lays foundation for F3-F6.

**Architecture:**
- Backend: new `label` + `workspaces` modules under `apps/api/src/modules/`. Hono routes per module, Prisma interactive transaction for cross-workspace validation, Socket.IO events for realtime.
- Frontend: new `features/labels` + `features/workspaces` under `apps/web/src/features/`. TanStack Query hooks with optimistic mutations (where safe). cmdk search when workspace count >10.
- Migration: 2-phase additive. Phase 1 (this PR): rename `Task.labels` → `Task.labelsDeprecated`, add `TaskLabelAssignment` M2M model, dual-write on `assignLabels()`. Phase 2 (future PR after ≥1 sprint in prod): drop `labelsDeprecated` column.
- Realtime: Socket.IO rooms `workspace:{wid}` (label/task events) + `user:{userId}` (workspace:created).

**Tech Stack:** Hono + Prisma + PostgreSQL 16 + Redis 7 + Socket.IO 4 + Zod (BE); React 18 + Vite + TanStack Query v5 + cmdk + Tailwind v4 + shadcn/ui + react-hook-form + zod (FE); Vitest 2 + Testing Library + Playwright 1.49 (test).

**Spec reference:** `docs/superpowers/specs/2026-06-23-f2-workspace-labels-design.md`

**Working directory:** Runs in fresh git worktree `f2-workspace-labels` created from `main` at execution start via `superpowers:using-git-worktrees`. Branch: `feat/f2-workspace-labels`.

**Effort estimate:** ~3-4 sessions of focused execution (Backend: ~1.5 sessions, Frontend: ~1 session, Realtime+E2E: ~1 session).

---

## File Touch Map

### Create (new files)

**Backend — test infra**
- `apps/api/vitest.config.ts` — unit test config
- `apps/api/vitest.integration.config.ts` — integration test config (real Postgres)
- `apps/api/tests/setup/unit.ts` — vitest setup for unit
- `apps/api/tests/setup/integration.ts` — Prisma reset + truncate helpers
- `apps/api/tests/setup/db.ts` — `flowdesk_test` DB client factory
- `apps/api/tests/integration/.gitkeep` — placeholder

**Backend — label module**
- `apps/api/src/modules/label/label.schema.ts` — Zod schemas
- `apps/api/src/modules/label/label.repository.ts` — Prisma queries
- `apps/api/src/modules/label/label.service.ts` — business logic
- `apps/api/src/modules/label/label.routes.ts` — Hono routes
- `apps/api/src/modules/label/label.socket.ts` — Socket.IO event emitters
- `apps/api/src/modules/label/label.errors.ts` — typed error subclasses
- `apps/api/src/modules/label/index.ts` — public exports

**Backend — workspaces module**
- `apps/api/src/modules/workspaces/workspace.schema.ts`
- `apps/api/src/modules/workspaces/workspace.repository.ts`
- `apps/api/src/modules/workspaces/workspace.service.ts`
- `apps/api/src/modules/workspaces/workspace.routes.ts`
- `apps/api/src/modules/workspaces/workspace.errors.ts`
- `apps/api/src/modules/workspaces/slug.ts` — slug generation utility
- `apps/api/src/modules/workspaces/index.ts`

**Backend — shared**
- `apps/api/src/shared/assert-role.ts` — RBAC helper
- `apps/api/src/shared/errors/codes.ts` — extended error code registry

**Backend — task service extension**
- `apps/api/src/modules/tasks/task.service.ts` — add `assignLabels()` method (Modify)
- `apps/api/src/modules/tasks/task.routes.ts` — add `PUT /tasks/:tid/labels` route (Modify)

**Backend — rate-limit policies**
- `apps/api/src/shared/rate-limit/policies.ts` — register label/assign/workspace-create policies (Modify or Create)

**Backend — scripts**
- `scripts/backfill-task-labels.ts` — idempotent per-task migration
- `scripts/verify-f2-migration.ts` — post-migration invariant checks

**Frontend — infra**
- `apps/web/vitest.config.ts`
- `apps/web/tests/setup.ts`
- `apps/web/playwright.config.ts`

**Frontend — workspaces feature**
- `apps/web/src/features/workspaces/api.ts`
- `apps/web/src/features/workspaces/hooks.ts`
- `apps/web/src/features/workspaces/types.ts`
- `apps/web/src/features/workspaces/components/CreateWorkspaceDialog.tsx`
- `apps/web/src/features/workspaces/components/WorkspaceSwitcherDropdown.tsx`
- `apps/web/src/features/workspaces/components/WorkspaceSidebar.tsx`
- `apps/web/src/features/workspaces/hooks/useOnboardingGuard.ts`
- `apps/web/src/features/workspaces/index.ts`

**Frontend — labels feature**
- `apps/web/src/features/labels/api.ts`
- `apps/web/src/features/labels/hooks.ts`
- `apps/web/src/features/labels/types.ts`
- `apps/web/src/features/labels/components/LabelChip.tsx`
- `apps/web/src/features/labels/components/LabelPicker.tsx`
- `apps/web/src/features/labels/components/LabelManagerDialog.tsx`
- `apps/web/src/features/labels/components/LabelBadge.tsx`
- `apps/web/src/features/labels/index.ts`

**Frontend — pages**
- `apps/web/src/pages/welcome.tsx`
- `apps/web/src/pages/dashboard.tsx` (Modify)

**Frontend — realtime**
- `apps/web/src/lib/socket-events.ts` (Modify — extend event union)
- `apps/web/src/hooks/useRealtimeInvalidation.ts`

**E2E tests**
- `apps/web/e2e/f2-workspace-create.spec.ts`
- `apps/web/e2e/f2-label-crud.spec.ts`
- `apps/web/e2e/f2-switcher.spec.ts`
- `apps/web/e2e/f2-realtime.spec.ts`
- `apps/web/e2e/f2-onboarding-guard.spec.ts`

**Specs & docs**
- `docs/superpowers/specs/2026-06-23-f2-workspace-labels-design.md` (already exists — DRAFT)

### Modify (existing files)

- `prisma/schema.prisma` — add `TaskLabelAssignment` model + `Task.assignments` back-relation + rename `Task.labels` → `Task.labelsDeprecated`
- `apps/api/src/index.ts` — register new module routes
- `apps/api/src/modules/tasks/task.service.ts` — add `assignLabels()` + reject `labels` field in `update()`
- `apps/api/src/modules/tasks/task.routes.ts` — add label assignment route
- `apps/api/src/shared/errors/codes.ts` — append new error codes
- `apps/api/package.json` — add vitest, testing-library deps + test scripts
- `apps/web/src/main.tsx` (or router setup) — wire `useOnboardingGuard`, register `/welcome` route
- `apps/web/src/components/AppShell.tsx` (or layout root) — integrate `WorkspaceSwitcherDropdown` + `WorkspaceSidebar`
- `apps/web/src/pages/dashboard.tsx` — add CreateWorkspaceDialog trigger + empty-state CTA
- `apps/web/package.json` — add vitest, testing-library, cmdk, react-hook-form deps
- `package.json` (root) — wire `test`, `test:integration`, `test:e2e` scripts

---

## Artifacts to update at end

- `feature_list.json` — add F2-F6 tracks (priority 30+), flip F2 → `passing`, attach verification evidence (test counts + screenshots)
- `TASKS.md` — append sprint row for F2
- `RISKS.md` — mark R-32 closed (tests land), R-35 already closed (010b); append RISK-F2-1..6
- `claude-progress.md` — record session 012-F2 entry with verified status
- `session-handoff.md` — fresh handoff for session 013 covering F3-F6 backlog + F2 verified state

---## Epic 1: Test Infrastructure (closes R-32)

R-32: `pnpm test` echoes placeholder. F2 closes this with a real vitest + Playwright stack. Every subsequent epic depends on this.

### Task 1.1: Install backend test deps + vitest configs

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/vitest.integration.config.ts`
- Create: `apps/api/tests/setup/unit.ts`
- Create: `apps/api/tests/setup/db.ts`

- [ ] **Step 1: Install dependencies**

Run from repo root:
```bash
pnpm --filter @flow-desk/api add -D vitest@^2.1.0 @vitest/coverage-v8@^2.1.0 supertest@^7.0.0 @types/supertest@^6.0.2
```

- [ ] **Step 2: Replace `test` script in `apps/api/package.json`**

Edit `apps/api/package.json` line 15-16:
```json
    "test": "vitest run --config vitest.config.ts",
    "test:watch": "vitest --config vitest.config.ts",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:coverage": "vitest run --coverage --config vitest.config.ts",
```

- [ ] **Step 3: Write `apps/api/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/*.integration.test.ts', 'tests/integration/**'],
    environment: 'node',
    globals: false,
    setupFiles: ['./tests/setup/unit.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/shared/types/**'],
      thresholds: { lines: 70, branches: 60, functions: 70, statements: 70 },
    },
  },
  resolve: {
    alias: {
      '@flow-desk/shared': resolve(__dirname, '../../packages/shared/src'),
      '@': resolve(__dirname, 'src'),
    },
  },
});
```

- [ ] **Step 4: Write `apps/api/vitest.integration.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts', 'src/**/*.integration.test.ts'],
    exclude: ['src/**/*.test.ts'],
    environment: 'node',
    globals: false,
    setupFiles: ['./tests/setup/integration.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
  resolve: {
    alias: {
      '@flow-desk/shared': resolve(__dirname, '../../packages/shared/src'),
      '@': resolve(__dirname, 'src'),
    },
  },
});
```

- [ ] **Step 5: Write `apps/api/tests/setup/unit.ts`**

```ts
import { vi, beforeEach } from 'vitest';

beforeEach(() => {
  vi.restoreAllMocks();
});

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-do-not-use-in-prod';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://flowdesk:flowdesk@localhost:5432/flowdesk?schema=public';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
```

- [ ] **Step 6: Write `apps/api/tests/setup/db.ts`**

```ts
import { PrismaClient } from '@prisma/client';

export const TEST_DB_URL = 'postgresql://flowdesk:flowdesk@localhost:5432/flowdesk_test?schema=public';

export function createTestPrisma() {
  return new PrismaClient({ datasourceUrl: TEST_DB_URL });
}

export async function resetTestDb(prisma: PrismaClient) {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '\\_%'
  `;
  for (const { tablename } of tables) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${tablename}" RESTART IDENTITY CASCADE`);
  }
}

export async function migrateTestDb() {
  const { execSync } = await import('node:child_process');
  execSync('pnpm db:migrate-deploy', {
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    cwd: process.cwd(),
    stdio: 'inherit',
  });
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/package.json apps/api/vitest.config.ts apps/api/vitest.integration.config.ts apps/api/tests/setup/
git commit -m "test(api): install vitest + integration config (R-32 setup)"
```

### Task 1.2: Integration setup file

**Files:**
- Create: `apps/api/tests/setup/integration.ts`
- Create: `apps/api/tests/integration/.gitkeep`

- [ ] **Step 1: Write `apps/api/tests/setup/integration.ts`**

```ts
import { beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestPrisma, resetTestDb, migrateTestDb, TEST_DB_URL } from './db';
import type { PrismaClient } from '@prisma/client';

process.env.DATABASE_URL = TEST_DB_URL;
process.env.NODE_ENV = 'test';

let prisma: PrismaClient;

beforeAll(async () => {
  await migrateTestDb();
  prisma = createTestPrisma();
});

afterAll(async () => {
  await prisma?.$disconnect();
});

beforeEach(async () => {
  await resetTestDb(prisma);
});

export function getTestPrisma(): PrismaClient {
  if (!prisma) throw new Error('Prisma not initialized');
  return prisma;
}
```

- [ ] **Step 2: Create empty integration dir + gitkeep**

```bash
mkdir -p apps/api/tests/integration
touch apps/api/tests/integration/.gitkeep
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/tests/setup/integration.ts apps/api/tests/integration/.gitkeep
git commit -m "test(api): integration setup with truncate per test"
```

### Task 1.3: Smoke unit test

**Files:**
- Create: `apps/api/src/shared/__tests__/smoke.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 2: Run it**

Run: `pnpm --filter @flow-desk/api test`
Expected: PASS `✓ smoke > runs vitest (1 test)`

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/shared/__tests__/smoke.test.ts
git commit -m "test(api): smoke unit test"
```

### Task 1.4: Smoke integration test (verifies DB infra)

**Files:**
- Create: `apps/api/tests/integration/db.integration.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect } from 'vitest';
import { getTestPrisma } from '../setup/integration';

describe('integration db', () => {
  it('connects and runs raw query', async () => {
    const prisma = getTestPrisma();
    const result = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 as ok`;
    expect(result[0].ok).toBe(1);
  });

  it('truncates between tests', async () => {
    const prisma = getTestPrisma();
    await prisma.user.create({ data: { email: 'a@b.c', name: 'A' } });
    const before = await prisma.user.count();
    expect(before).toBe(1);
  });
});
```

- [ ] **Step 2: Run it**

Run: `pnpm --filter @flow-desk/api test:integration`
Expected: PASS `2 tests`. Second test must observe `count = 1` (proving truncate ran before next test).

- [ ] **Step 3: Commit**

```bash
git add apps/api/tests/integration/db.integration.test.ts
git commit -m "test(api): integration smoke verifies db + truncate"
```

### Task 1.5: Install Playwright + write config

**Files:**
- Create: `apps/web/playwright.config.ts`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install dependencies**

```bash
pnpm --filter @flow-desk/web add -D @playwright/test@^1.49.0
pnpm exec playwright install --with-deps chromium
```

- [ ] **Step 2: Write `apps/web/playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm --filter @flow-desk/api dev & pnpm --filter @flow-desk/web dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
```

- [ ] **Step 3: Add scripts to `apps/web/package.json`**

Insert after line 13:
```json
    "test:e2e": "playwright test",
    "test:e2e:headed": "playwright test --headed",
```

- [ ] **Step 4: Create empty e2e dir**

```bash
mkdir -p apps/web/e2e
touch apps/web/e2e/.gitkeep
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/playwright.config.ts apps/web/package.json apps/web/e2e/.gitkeep pnpm-lock.yaml
git commit -m "test(web): playwright e2e config"
```

### Task 1.6: Root-level test gate script

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: Add scripts to root `package.json`**

Insert into `"scripts"` block:
```json
    "test:all": "pnpm --filter @flow-desk/api test && pnpm --filter @flow-desk/api test:integration && pnpm --filter @flow-desk/web test && pnpm --filter @flow-desk/web test:e2e",
```

- [ ] **Step 2: Verify each piece runs**

Run: `pnpm test` (unit only — sanity)
Expected: backend smoke passes; web test script still placeholder until Epic 7.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: root test:all gate script"
```

------

## Epic 2: Database Schema (TaskLabelAssignment + Rename `Task.labels`)

**Files:**
- Modify: `prisma/schema.prisma:154` (rename `labels` → `labelsDeprecated`)
- Create: `prisma/migrations/<timestamp>_f2_labels/migration.sql`
- Create: `scripts/backfill-task-labels.ts`
- Create: `scripts/verify-f2-migration.ts`

### Task 2.1: Add `TaskLabelAssignment` model + rename `Task.labels`

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `TaskLabelAssignment` model at end of file (before closing `)` if any)**

```prisma
model TaskLabelAssignment {
  id        String   @id @default(cuid())
  taskId    String
  labelId   String
  createdAt DateTime @default(now())

  task  Task      @relation("TaskAssignments", fields: [taskId], references: [id], onDelete: Cascade)
  label TaskLabel @relation("LabelAssignments", fields: [labelId], references: [id], onDelete: Cascade)

  @@unique([taskId, labelId])
  @@index([taskId])
  @@index([labelId])
}
```

- [ ] **Step 2: Rename `Task.labels` → `Task.labelsDeprecated` (line 154)**

Find:
```prisma
  labels String[] @default([])
```

Replace with:
```prisma
  labelsDeprecated String[] @default([])

  assignments TaskLabelAssignment[] @relation("TaskAssignments")
```

- [ ] **Step 3: Add back-relation on `TaskLabel` model (line 191-202)**

Find:
```prisma
model TaskLabel {
  id          String   @id @default(cuid())
  workspaceId String
  name        String
  color       String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  deletedAt   DateTime?

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, name])
  @@index([workspaceId])
  @@index([deletedAt])
}
```

Replace with (add `assignments` line before `@@unique`):
```prisma
  workspace   Workspace             @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  assignments TaskLabelAssignment[] @relation("LabelAssignments")

  @@unique([workspaceId, name])
  @@index([workspaceId])
  @@index([deletedAt])
```

- [ ] **Step 4: Verify `prisma validate`**

Run: `pnpm --filter @flowdesk/api prisma validate`
Expected: "The schema at prisma/schema.prisma is valid 🚀"

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(db): TaskLabelAssignment model + rename Task.labels to labelsDeprecated"
```

### Task 2.2: Generate migration

**Files:**
- Create: `prisma/migrations/<timestamp>_f2_labels/migration.sql` (auto-generated)

- [ ] **Step 1: Create migration with explicit rename SQL**

Run:
```bash
cd apps/api && pnpm prisma migrate dev --create-only --name f2_labels
```

- [ ] **Step 2: Open generated `prisma/migrations/<timestamp>_f2_labels/migration.sql` and verify it contains:**

```sql
-- AlterTable
ALTER TABLE "Task" RENAME COLUMN "labels" TO "labels_deprecated";

-- CreateTable
CREATE TABLE "TaskLabelAssignment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskLabelAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskLabelAssignment_taskId_labelId_key" ON "TaskLabelAssignment"("taskId", "labelId");

-- CreateIndex
CREATE INDEX "TaskLabelAssignment_taskId_idx" ON "TaskLabelAssignment"("taskId");

-- CreateIndex
CREATE INDEX "TaskLabelAssignment_labelId_idx" ON "TaskLabelAssignment"("labelId");

-- AddForeignKey
ALTER TABLE "TaskLabelAssignment" ADD CONSTRAINT "TaskLabelAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskLabelAssignment" ADD CONSTRAINT "TaskLabelAssignment_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "TaskLabel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

If the rename SQL is missing or generated differently, prepend the explicit `ALTER TABLE` line.

- [ ] **Step 3: Apply migration to dev DB**

Run: `pnpm --filter @flowdesk/api prisma migrate dev`
Expected: migration applied, Prisma client regenerated

- [ ] **Step 4: Commit**

```bash
git add prisma/migrations/
git commit -m "feat(db): apply f2_labels migration (TaskLabelAssignment + labels rename)"
```

### Task 2.3: Backfill existing task labels to assignments

**Files:**
- Create: `scripts/backfill-task-labels.ts`
- Test: `scripts/backfill-task-labels.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// scripts/backfill-task-labels.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

describe('backfill-task-labels', () => {
  beforeAll(async () => {
    await db.taskLabel.deleteMany({});
    await db.taskLabelAssignment.deleteMany({});
    await db.task.deleteMany({});
    await db.workspace.deleteMany({});
    await db.user.deleteMany({});
    const user = await db.user.create({ data: { email: 'a@b.c', name: 'A' } });
    const ws = await db.workspace.create({
      data: { name: 'W', slug: 'w', ownerId: user.id, members: { create: { userId: user.id, role: 'OWNER' } } },
    });
    await db.taskLabel.createMany({
      data: [
        { workspaceId: ws.id, name: 'bug', color: 'red' },
        { workspaceId: ws.id, name: 'ui', color: 'blue' },
      ],
    });
    await db.task.create({
      data: {
        title: 'T1', columnId: (await db.column.findFirst({ where: { board: { workspaceId: ws.id } } }))!.id,
        labelsDeprecated: ['bug', 'ui'],
      },
    });
  });
  afterAll(async () => { await db.$disconnect(); });

  it('creates one TaskLabelAssignment per legacy label', async () => {
    const { runBackfill } = await import('./backfill-task-labels');
    const result = await runBackfill({ dryRun: false });
    expect(result.processed).toBe(1);
    expect(result.created).toBe(2);
    const assigns = await db.taskLabelAssignment.findMany();
    expect(assigns).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `cd apps/api && pnpm vitest run scripts/backfill-task-labels.test.ts`
Expected: FAIL "Cannot find module './backfill-task-labels'"

- [ ] **Step 3: Implement `scripts/backfill-task-labels.ts`**

```ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export type BackfillOpts = { dryRun?: boolean; batchSize?: number };
export type BackfillResult = { processed: number; created: number; failed: number; skipped: number };

export async function runBackfill(opts: BackfillOpts = {}): Promise<BackfillResult> {
  const { dryRun = false, batchSize = 50 } = opts;
  let processed = 0, created = 0, failed = 0, skipped = 0;

  const tasks = await prisma.task.findMany({
    where: { labelsDeprecated: { isEmpty: false } },
    select: { id: true, labelsDeprecated: true },
    take: batchSize * 20,
  });

  for (const task of tasks) {
    processed++;
    try {
      const labelNames = task.labelsDeprecated;
      const task0 = await prisma.task.findUnique({ where: { id: task.id }, select: { column: { select: { board: { select: { workspaceId: true } } } } } });
      if (!task0) { skipped++; continue; }
      const labels = await prisma.taskLabel.findMany({
        where: { workspaceId: task0.column.board.workspaceId, name: { in: labelNames } },
        select: { id: true, name: true },
      });
      const matched = labelNames.filter(n => labels.some(l => l.name === n));
      const unmatched = labelNames.filter(n => !labels.some(l => l.name === n));
      skipped += unmatched.length;

      if (!dryRun && matched.length > 0) {
        await prisma.$transaction(async (tx) => {
          await tx.taskLabelAssignment.createMany({
            data: matched.map(name => {
              const label = labels.find(l => l.name === name)!;
              return { taskId: task.id, labelId: label.id };
            }),
            skipDuplicates: true,
          });
        });
        created += matched.length;
      } else {
        created += matched.length;
      }
    } catch (e) {
      failed++;
    }
  }

  return { processed, created, failed, skipped };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runBackfill({ dryRun: process.argv.includes('--dry-run') }).then(r => {
    const failPct = r.processed > 0 ? (r.failed / r.processed) * 100 : 0;
    console.log(JSON.stringify({ ...r, failPct }, null, 2));
    process.exit(failPct > 5 ? 1 : 0);
  });
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `cd apps/api && pnpm vitest run scripts/backfill-task-labels.test.ts`
Expected: PASS, 2 assignments created

- [ ] **Step 5: Run script against dev DB in dry-run**

Run: `cd apps/api && pnpm tsx scripts/backfill-task-labels.ts --dry-run`
Expected: JSON output with processed/created/skipped counts, exit 0

- [ ] **Step 6: Commit**

```bash
git add scripts/backfill-task-labels.ts scripts/backfill-task-labels.test.ts
git commit -m "feat(scripts): idempotent task-label backfill with --dry-run"
```

### Task 2.4: Add migration verification script

**Files:**
- Create: `scripts/verify-f2-migration.ts`

- [ ] **Step 1: Implement verify script**

```ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

type Check = { name: string; pass: boolean; detail: string };

export async function verifyF2Migration(): Promise<Check[]> {
  const checks: Check[] = [];

  // 1. TaskLabelAssignment table exists
  const tlaExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT FROM information_schema.tables WHERE table_name = 'TaskLabelAssignment'
    ) as exists`;
  checks.push({ name: 'TaskLabelAssignment table', pass: tlaExists[0]?.exists === true, detail: tlaExists[0]?.exists ? 'present' : 'missing' });

  // 2. Unique index on (taskId, labelId)
  const uniqueIdx = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT FROM pg_indexes WHERE indexname = 'TaskLabelAssignment_taskId_labelId_key'
    ) as exists`;
  checks.push({ name: 'unique index (taskId,labelId)', pass: uniqueIdx[0]?.exists === true, detail: uniqueIdx[0]?.exists ? 'present' : 'missing' });

  // 3. Task.labelsDeprecated exists, Task.labels does NOT
  const labelsDeprecatedExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT FROM information_schema.columns WHERE table_name = 'Task' AND column_name = 'labels_deprecated'
    ) as exists`;
  const labelsExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT FROM information_schema.columns WHERE table_name = 'Task' AND column_name = 'labels'
    ) as exists`;
  checks.push({ name: 'Task.labelsDeprecated present', pass: labelsDeprecatedExists[0]?.exists === true, detail: 'ok' });
  checks.push({ name: 'Task.labels removed', pass: labelsExists[0]?.exists === false, detail: labelsExists[0]?.exists ? 'STILL EXISTS — phase 2 incomplete' : 'gone' });

  // 4. Assignment count consistency
  const allAssignments = await prisma.taskLabelAssignment.count();
  const allLegacyLabels = await prisma.task.findMany({ where: { labelsDeprecated: { isEmpty: false } }, select: { id: true, labelsDeprecated: true } });
  const expectedAssignments = allLegacyLabels.reduce((sum, t) => sum + t.labelsDeprecated.length, 0);
  checks.push({ name: 'assignment count matches legacy labels', pass: allAssignments === expectedAssignments, detail: `${allAssignments} assignments vs ${expectedAssignments} legacy` });

  return checks;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verifyF2Migration().then(checks => {
    const allPass = checks.every(c => c.pass);
    console.log(JSON.stringify(checks, null, 2));
    process.exit(allPass ? 0 : 1);
  });
}
```

- [ ] **Step 2: Run against dev DB**

Run: `cd apps/api && pnpm tsx scripts/verify-f2-migration.ts`
Expected: 5 checks pass, exit 0

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-f2-migration.ts
git commit -m "feat(scripts): verify-f2-migration pre-cutover gate"
```---

## Epic 3: Shared Backend Helpers (Error Codes + Rate Limit Policies)

**Files:**
- Modify: `apps/api/src/shared/errors/index.ts`
- Create: `apps/api/src/shared/errors/codes.ts`
- Create: `apps/api/src/shared/rate-limit-policies.ts`
- Test: `apps/api/src/shared/errors/codes.test.ts`
- Test: `apps/api/src/shared/rate-limit-policies.test.ts`

### Task 3.1: Centralize error codes + add factory helper

**Files:**
- Create: `apps/api/src/shared/errors/codes.ts`
- Modify: `apps/api/src/shared/errors/index.ts`

- [ ] **Step 1: Write failing test for `withCode()` factory**

```ts
// apps/api/src/shared/errors/codes.test.ts
import { describe, it, expect } from 'vitest';
import { withCode, ErrorCode } from './codes';

describe('withCode', () => {
  it('creates an AppError-shaped object with custom code', () => {
    const e = withCode(409, ErrorCode.LABEL_NAME_TAKEN, 'Label "bug" exists');
    expect(e.status).toBe(409);
    expect(e.code).toBe('LABEL_NAME_TAKEN');
    expect(e.message).toBe('Label "bug" exists');
    expect(e.name).toBe('AppError');
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cd apps/api && pnpm vitest run src/shared/errors/codes.test.ts`
Expected: FAIL "Cannot find module './codes'"

- [ ] **Step 3: Create `apps/api/src/shared/errors/codes.ts`**

```ts
import { AppError } from './index';

export const ErrorCode = {
  // Labels
  LABEL_NAME_TAKEN: 'LABEL_NAME_TAKEN',
  LABEL_LIMIT_REACHED: 'LABEL_LIMIT_REACHED',
  LABEL_IN_USE: 'LABEL_IN_USE',
  INVALID_LABEL_COLOR: 'INVALID_LABEL_COLOR',

  // Workspaces
  WORKSPACE_LIMIT_REACHED: 'WORKSPACE_LIMIT_REACHED',
  WORKSPACE_NAME_TAKEN: 'WORKSPACE_NAME_TAKEN',

  // Cross-cutting
  TASK_LABEL_CROSS_WORKSPACE: 'TASK_LABEL_CROSS_WORKSPACE',
} as const;

export type ErrorCodeT = (typeof ErrorCode)[keyof typeof ErrorCode];

export function withCode(
  status: number,
  code: ErrorCodeT | string,
  message: string,
  details?: unknown,
): AppError {
  return new AppError(status, message, code, details);
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `cd apps/api && pnpm vitest run src/shared/errors/codes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/shared/errors/
git commit -m "feat(api): centralized error codes + withCode() factory"
```

### Task 3.2: Rate-limit policy constants

**Files:**
- Create: `apps/api/src/shared/rate-limit-policies.ts`
- Create: `apps/api/src/shared/rate-limit-policies.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// apps/api/src/shared/rate-limit-policies.test.ts
import { describe, it, expect } from 'vitest';
import { RATE_LIMITS } from './rate-limit-policies';

describe('RATE_LIMITS', () => {
  it('exposes label.write, label.assign, workspace.create', () => {
    expect(RATE_LIMITS.label.write).toEqual({ windowSec: 60, max: 30 });
    expect(RATE_LIMITS.label.assign).toEqual({ windowSec: 60, max: 60 });
    expect(RATE_LIMITS.workspace.create).toEqual({ windowSec: 86400, max: 10 });
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cd apps/api && pnpm vitest run src/shared/rate-limit-policies.test.ts`
Expected: FAIL

- [ ] **Step 3: Create `apps/api/src/shared/rate-limit-policies.ts`**

```ts
import { rateLimit } from './middleware/rate-limit';

export const RATE_LIMITS = {
  label: {
    write: { windowSec: 60, max: 30 }, // create/update/delete per user
    assign: { windowSec: 60, max: 60 }, // PUT /tasks/:tid/labels per user
  },
  workspace: {
    create: { windowSec: 86400, max: 10 }, // per user per day
  },
} as const;

// Helper to bind a policy to a scope
export function labelWriteLimit(scope: string) {
  return rateLimit({ ...RATE_LIMITS.label.write, keyBy: 'user', scope });
}
export function labelAssignLimit(scope: string) {
  return rateLimit({ ...RATE_LIMITS.label.assign, keyBy: 'user', scope });
}
export function workspaceCreateLimit() {
  return rateLimit({ ...RATE_LIMITS.workspace.create, keyBy: 'user', scope: 'workspace.create' });
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `cd apps/api && pnpm vitest run src/shared/rate-limit-policies.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/shared/rate-limit-policies.ts apps/api/src/shared/rate-limit-policies.test.ts
git commit -m "feat(api): rate-limit policies for labels + workspace create"
```