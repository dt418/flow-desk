# Plan 012 — Board Endpoint Over-Fetch

**Findings:** PERF-02
**Commit:** `732acb4`
**Effort:** S | **Risk:** LOW | **Files:** 1

## Problem

Board endpoint returns full Task rows (board.routes.ts:37-46) including `description`, `completedAt`, `labelsDeprecated`, `createdAt`, `updatedAt`, `deletedAt` — none of which the frontend uses. Only needs: id, title, status, priority, position, dueDate, version, assignee (id, name, email, avatarUrl), labels.

## Changes

**File:** `apps/api/src/modules/board/board.routes.ts`

Add explicit `select` on the tasks include (replace `include: { tasks: { ... } }`):

```typescript
include: {
  tasks: {
    where: { deletedAt: null },
    orderBy: { position: 'asc' },
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      position: true,
      dueDate: true,
      version: true,
      columnId: true,
      workspaceId: true,
      assigneeId: true,
      createdAt: true,
      assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
      labels: {
        include: { label: { select: { id: true, name: true, color: true } } },
      },
    },
    take: 50,
  },
},
```

Check the frontend `BoardTask` type in `apps/web/src/pages/board.tsx` or `apps/web/src/features/task/types.ts` to confirm the exact fields needed. The `labels` include may need adjustment — verify how labels are used on the board.

## Verification

```bash
# 1. Typecheck
pnpm --filter @flow-desk/api exec tsc --noEmit

# 2. Integration tests
pnpm --filter @flow-desk/api test:integration

# 3. Manual: open board page, verify tasks render with all fields
```

## Scope

- `apps/api/src/modules/board/board.routes.ts` — select fields
