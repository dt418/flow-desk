# Plan 016 — Auth + Membership Caching

**Findings:** PERF-03, PERF-10
**Commit:** `732acb4`
**Effort:** M | **Risk:** MED | **Files:** 4

## Problem

1. **PERF-03** — `requireAuth()` (auth.ts:39-43) calls `prisma.user.findUnique` on every request. Combined with `requireWorkspaceRole` (line 60-63), that's 2 DB round-trips per request just for auth.
2. **PERF-10** — `assertMembership` (access.ts:4-9) runs `prisma.workspaceMember.findUnique` on every call. Used by nearly every service method (task list, task create, comment create, etc.).

## Changes

### Create auth cache module

**New file:** `apps/api/src/shared/lib/auth-cache.ts`

```typescript
import { redis } from './redis';
import { prisma } from './prisma';
import { logger } from './logger';

const AUTH_CACHE_TTL = 30; // seconds
const MEMBER_CACHE_TTL = 30; // seconds

export async function getCachedUser(userId: string) {
  const key = `auth:user:${userId}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached) as { id: string; email: string; name: string; deletedAt: string | null };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, avatarUrl: true, deletedAt: true },
  });
  if (user) {
    await redis.set(key, JSON.stringify(user), 'EX', AUTH_CACHE_TTL);
  }
  return user;
}

export async function getCachedMembership(workspaceId: string, userId: string) {
  const key = `auth:member:${workspaceId}:${userId}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached) as { role: string } | null;

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  await redis.set(key, JSON.stringify(member), 'EX', MEMBER_CACHE_TTL);
  return member;
}

export async function invalidateMembershipCache(workspaceId: string, userId: string) {
  await redis.del(`auth:member:${workspaceId}:${userId}`);
}

export async function invalidateUserCache(userId: string) {
  await redis.del(`auth:user:${userId}`);
}
```

### Update auth middleware

**File:** `apps/api/src/shared/middleware/auth.ts`

```typescript
// BEFORE
const user = await prisma.user.findUnique({ ... });

// AFTER
import { getCachedUser } from '../lib/auth-cache';
const user = await getCachedUser(payload.userId);
```

### Update assertMembership

**File:** `apps/api/src/shared/lib/access.ts`

```typescript
// BEFORE
const member = await prisma.workspaceMember.findUnique({ ... });

// AFTER
import { getCachedMembership } from './auth-cache';
const member = await getCachedMembership(workspaceId, userId);
```

### Invalidation points

When a user's profile changes (name, email), call `invalidateUserCache(userId)`.
When a member is added/removed/role-changed, call `invalidateMembershipCache(workspaceId, userId)`.

Key invalidation points:
- `apps/api/src/modules/workspace/member.service.ts` — add/remove/update member
- `apps/api/src/modules/auth/auth.routes.ts` — if profile update exists

## Verification

```bash
# 1. Typecheck
pnpm --filter @flow-desk/api exec tsc --noEmit

# 2. Integration tests
pnpm --filter @flow-desk/api test:integration

# 3. Manual: verify auth still works, cache hit on second request
```

## Risk

- Stale cache: user deleted but still authenticated for up to 30s. Acceptable for most use cases. For critical ops (payment, admin), bypass cache.
- Redis down: fallback to direct DB query. Add try/catch around cache reads.

## Scope

- `apps/api/src/shared/lib/auth-cache.ts` (new)
- `apps/api/src/shared/middleware/auth.ts`
- `apps/api/src/shared/lib/access.ts`
- `apps/api/src/modules/workspace/member.service.ts` (invalidation)
