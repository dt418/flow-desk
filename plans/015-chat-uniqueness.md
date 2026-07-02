# Plan 015 — Chat Channel Uniqueness

**Findings:** CORRECT-08
**Commit:** `732acb4`
**Effort:** S | **Risk:** LOW | **Files:** 2

## Problem

`createChannel` (chat.service.ts:68-80) checks for duplicate names via `findFirst` then calls `repo.create` — two separate DB calls outside a transaction. Concurrent requests can both pass the check and create duplicates.

## Changes

**Option A (recommended):** Rely on a unique index constraint.

**File:** `packages/db/prisma/schema.prisma`

Check if `ChatChannel` already has a unique constraint on `(workspaceId, name, deletedAt)`. If not, add one:

```prisma
model ChatChannel {
  // ... existing fields
  @@unique([workspaceId, name, deletedAt], name: "channel_workspace_name_unique")
}
```

Note: `deletedAt` is nullable, so this unique constraint applies to non-deleted channels only (PostgreSQL treats NULLs as distinct). This is the correct behavior for soft-delete.

**File:** `apps/api/src/modules/chat/chat.service.ts`

Remove the `findFirst` check and catch the Prisma unique constraint error:

```typescript
// BEFORE (lines 68-80)
const existing = await chatChannel.findFirst({ ... });
if (existing) throw new ConflictError('Channel name already exists');
return repo.create(prisma, { ... });

// AFTER
try {
  return await repo.create(prisma, { ... });
} catch (err) {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    throw new ConflictError('Channel name already exists');
  }
  throw err;
}
```

**Option B (simpler, no migration):** Wrap in transaction:

```typescript
return prisma.$transaction(async (tx) => {
  const existing = await tx.chatChannel.findFirst({
    where: { workspaceId, name, deletedAt: null },
  });
  if (existing) throw new ConflictError('Channel name already exists');
  return repo.create(tx, { workspaceId, name, description, createdById });
});
```

Choose Option A if the schema doesn't already have the unique constraint. Choose Option B if adding a migration is undesirable right now.

## Verification

```bash
# 1. Typecheck
pnpm --filter @flow-desk/api exec tsc --noEmit

# 2. Integration tests
pnpm --filter @flow-desk/api test:integration

# 3. If Option A: run migration
pnpm --filter @flowdesk/db db:migrate
```

## Scope

- `apps/api/src/modules/chat/chat.service.ts`
- `packages/db/prisma/schema.prisma` (if Option A)
