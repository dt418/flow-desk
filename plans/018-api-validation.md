# Plan 018 — API Client Response Validation

**Findings:** TECH-09
**Commit:** `732acb4`
**Effort:** M | **Risk:** MED | **Files:** 3

## Problem

Frontend API client (`apps/web/src/lib/api.ts:43`) does `return body as T` — no runtime validation. If the backend changes response shape, the frontend gets silent runtime crashes.

## Changes

### 1. Update API client to accept Zod schema

**File:** `apps/web/src/lib/api.ts`

```typescript
import { z } from 'zod';

interface ApiOptions extends RequestInit {
  schema?: z.ZodType;
}

export async function api<T = unknown>(
  url: string,
  options: ApiOptions = {},
): Promise<T> {
  const { schema, ...fetchOptions } = options;

  const res = await fetch(url, {
    ...fetchOptions,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...fetchOptions.headers },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.message || 'Request failed', body);
  }

  const body = await res.json();

  if (schema) {
    return schema.parse(body) as T;
  }

  return body as T;
}
```

### 2. Define Zod schemas for key responses

**File:** `apps/web/src/features/task/types.ts` (or new `schemas.ts`)

```typescript
import { z } from 'zod';

export const BoardTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
  position: z.number(),
  dueDate: z.string().nullable(),
  version: z.number(),
  columnId: z.string(),
  assignee: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    avatarUrl: z.string().nullable(),
  }).nullable(),
  labels: z.array(z.object({
    label: z.object({ id: z.string(), name: z.string(), color: z.string() }),
  })),
});

export const BoardResponseSchema = z.object({
  columns: z.array(z.object({
    id: z.string(),
    name: z.string(),
    tasks: z.array(BoardTaskSchema),
  })),
  nextCursor: z.string().nullable(),
});
```

### 3. Use schemas in API calls

```typescript
// BEFORE
const data = await api<BoardResponse>('/api/workspaces/.../board');

// AFTER
const data = await api('/api/workspaces/.../board', { schema: BoardResponseSchema });
```

## Verification

```bash
# 1. Typecheck
pnpm --filter @flow-desk/web exec tsc --noEmit

# 2. Build
pnpm --filter @flow-desk/web build

# 3. Manual: verify board, task, and chat pages still load correctly
```

## Risk

- Schema drift: if backend changes and schema isn't updated, Zod throws. This is the desired behavior — forces explicit handling.
- Performance: `.parse()` on every response adds ~1ms. Negligible.

## Scope

- `apps/web/src/lib/api.ts` — schema parameter
- `apps/web/src/features/task/types.ts` — response schemas
- API call sites — add schema option (start with board, task list)

## Out of Scope

- Full schema coverage for all endpoints — iterative, add as needed
- Backend Zod schema sharing (packages/shared) — separate initiative
