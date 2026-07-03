# Plan 021 — E2E Realtime Test

**Findings:** TC-04
**Commit:** `732acb4`
**Effort:** M | **Risk:** LOW | **Files:** 2

## Problem

E2E realtime spec (e2e/realtime.spec.ts:1-14) titled "Realtime label sync" only navigates to board page and asserts heading is visible. No second browser context, no mutation → assertion loop. Core multi-client sync feature untested.

## Prerequisites

- Plan 020 (CI unit tests) — establishes test infrastructure.

## Changes

**File:** `e2e/realtime.spec.ts`

Rewrite to test actual realtime sync:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Realtime task sync', () => {
  test("moving a task on one board updates the other user's board", async ({ browser }) => {
    // Create two authenticated contexts
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    // Login both users (use helper to set auth cookies)
    await loginAs(pageA, 'user-a@test.com');
    await loginAs(pageB, 'user-b@test.com');

    // Both navigate to same workspace board
    await pageA.goto('/workspace/test-workspace/board');
    await pageB.goto('/workspace/test-workspace/board');

    // Wait for boards to load
    await expect(pageA.locator('[data-testid="kanban-column"]')).toHaveCount(3);
    await expect(pageB.locator('[data-testid="kanban-column"]')).toHaveCount(3);

    // Get task count in "Done" column for user B
    const doneColumnB = pageB.locator('[data-testid="kanban-column"]').last();
    const initialCount = await doneColumnB.locator('[data-testid="task-card"]').count();

    // User A moves a task to Done column (simulate drag)
    const taskA = pageA.locator('[data-testid="task-card"]').first();
    await taskA.dragTo(doneColumnB);

    // User B should see the task appear in Done within 2s
    await expect(doneColumnB.locator('[data-testid="task-card"]')).toHaveCount(initialCount + 1, {
      timeout: 2000,
    });

    await ctxA.close();
    await ctxB.close();
  });
});
```

### Add test data fixtures

Create a setup script or test helper that:

1. Creates two test users in the DB
2. Creates a workspace with both as members
3. Creates 3 columns with sample tasks
4. Returns auth cookies for both users

**File:** `e2e/helpers/auth.ts` (new)

```typescript
import type { Page } from '@playwright/test';

export async function loginAs(page: Page, email: string) {
  // Set auth cookies directly (faster than UI login)
  const { accessToken, refreshToken } = await getTestTokens(email);
  await page.context().addCookies([
    { name: 'access_token', value: accessToken, domain: 'localhost', path: '/' },
    { name: 'refresh_token', value: refreshToken, domain: 'localhost', path: '/' },
  ]);
}
```

## Verification

```bash
# 1. Run the specific test
npx playwright test e2e/realtime.spec.ts

# 2. Check no flakiness (run 3x)
for i in 1 2 3; do npx playwright test e2e/realtime.spec.ts; done
```

## Scope

- `e2e/realtime.spec.ts` — rewrite
- `e2e/helpers/auth.ts` (new) — test auth helper

## Out of Scope

- Chat realtime (separate test)
- Notification realtime (separate test)
- CI Playwright job — depends on infra decision (Docker services in CI)
