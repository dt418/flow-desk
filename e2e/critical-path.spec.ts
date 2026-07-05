import { test, expect } from './fixtures';

test.describe('Critical path @smoke', () => {
  test('login → workspace → create task → move via API', async ({ page, seedUser }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(seedUser.email);
    await page.getByLabel('Password').fill(seedUser.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/$|\/(board|dashboard)/, { timeout: 15_000 });

    await page.goto(`/board/${seedUser.workspaceId}`);
    await expect(page.getByRole('heading', { name: /board/i })).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /new task/i }).click();
    await page.getByLabel('Title').fill('Ship F2');
    await page.getByRole('button', { name: /create task/i }).click();

    const card = page.getByText('Ship F2').first();
    await expect(card).toBeVisible({ timeout: 5_000 });

    // Move task to second column via API (dnd-kit is not testable with Playwright's mouse API)
    const apiBase = process.env.API_BASE_URL ?? 'http://localhost:3000';
    const boardRes = await page.request.get(
      `${apiBase}/api/workspaces/${seedUser.workspaceId}/board`,
    );
    const board = await boardRes.json();
    const columns = board.columns;
    const taskId = columns[0].tasks[0].id;
    const toColumnId = columns[1].id;

    const moveRes = await page.request.post(`${apiBase}/api/tasks/${taskId}/move`, {
      data: { columnId: toColumnId, position: 0, version: columns[0].tasks[0].version },
    });
    expect(moveRes.ok()).toBeTruthy();

    // Reload to pick up the moved task (page.request bypasses React Query cache invalidation)
    await page.reload();
    await expect(page.locator('[data-column-id]').nth(1).getByText('Ship F2')).toBeVisible({
      timeout: 10_000,
    });
  });
});
