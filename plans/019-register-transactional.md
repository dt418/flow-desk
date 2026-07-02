# Plan 019 — Register/OAuth Transactional

**Findings:** CORRECT-06
**Commit:** `732acb4`
**Effort:** M | **Risk:** MED | **Files:** 1

## Problem

Register (auth.routes.ts:48-59) and OAuth callback (auth.routes.ts:244-260) create user + workspace + refresh token as sequential independent DB calls. No `prisma.$transaction`. If workspace creation fails after user creation, the user exists without a workspace. On retry, the partial state persists.

## Changes

**File:** `apps/api/src/modules/auth/auth.routes.ts`

### Register endpoint (around line 48-59)

Wrap in transaction:

```typescript
const result = await prisma.$transaction(async (tx) => {
  const user = await tx.user.create({
    data: { email, name, passwordHash, emailVerified: new Date() },
  });

  const workspace = await tx.workspace.create({
    data: {
      name: `${name}'s Workspace`,
      slug: slugify(name),
      ownerId: user.id,
      columns: { create: [{ name: 'To Do' }, { name: 'In Progress' }, { name: 'Done' }] },
    },
  });

  const refreshToken = await tx.refreshToken.create({
    data: { userId: user.id, token: generateRefreshToken(), expiresAt: /* ... */ },
  });

  return { user, workspace, refreshToken };
});
```

### OAuth callback (around line 244-260)

Same pattern. The key change: detect partial state and handle it.

```typescript
const result = await prisma.$transaction(async (tx) => {
  let user = await tx.user.findUnique({ where: { email: profile.email } });

  if (!user) {
    user = await tx.user.create({
      data: {
        email: profile.email,
        name: profile.name,
        avatarUrl: picture,
        emailVerified: new Date(),
      },
    });

    await tx.workspace.create({
      data: {
        name: `${profile.name}'s Workspace`,
        slug: slugify(profile.name),
        ownerId: user.id,
        columns: { create: [{ name: 'To Do' }, { name: 'In Progress' }, { name: 'Done' }] },
      },
    });
  }

  const refreshToken = await tx.refreshToken.create({
    data: { userId: user.id, token: generateRefreshToken(), expiresAt: /* ... */ },
  });

  return { user, refreshToken };
});
```

## Verification

```bash
# 1. Typecheck
pnpm --filter @flow-desk/api exec tsc --noEmit

# 2. Integration tests
pnpm --filter @flow-desk/api test:integration

# 3. Manual: test register + OAuth flow
```

## Risk

- Long transaction: if workspace creation is slow (e.g., column creation), the transaction holds locks longer. Acceptable for auth flows (low frequency).
- Prisma transaction timeout: default 5s. May need `timeout: 10000` if workspace creation includes many nested creates.

## Scope

- `apps/api/src/modules/auth/auth.routes.ts` — register + OAuth callback
