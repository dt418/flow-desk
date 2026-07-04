import { test, expect, loginViaUI, apiLogin } from './fixtures';
import { prisma } from './fixtures';

test.describe('Realtime label sync @realtime', () => {
  test('task created by user A appears on user B board via Socket.IO', async ({
    page,
    browser,
    seedUser,
  }) => {
    const apiBase = process.env.API_BASE_URL ?? 'http://localhost:3000';
    const cookie = await apiLogin(seedUser.email, seedUser.password);

    // Create a second user who is also a member of the workspace
    const user2Email = `e2e-rt2-${Date.now()}@flow-desk.app`;
    const user2 = await prisma.user.create({
      data: { email: user2Email, name: 'RT User 2' },
    });
    await prisma.user.update({
      where: { id: user2.id },
      data: { passwordHash: await import('bcryptjs').then((b) => b.hash('e2epass123', 10)) },
    });
    await prisma.workspaceMember.create({
      data: { userId: user2.id, workspaceId: seedUser.workspaceId, role: 'MEMBER' },
    });

    // Second user logs in via UI
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await page2.addInitScript(() => {
      const s = document.createElement('style');
      s.textContent = '.tsqd-parent-container { display: none !important }';
      document.head.appendChild(s);
    });

    await loginViaUI(page2, user2Email, 'e2epass123');

    // Both navigate to the board
    await page.goto('/login');
    await page.getByLabel('Email').fill(seedUser.email);
    await page.getByLabel('Password').fill(seedUser.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/$|\/(board|dashboard)/, { timeout: 15_000 });

    await page.goto(`/board/${seedUser.workspaceId}`);
    await expect(page.getByRole('heading', { name: /board/i })).toBeVisible({ timeout: 15_000 });

    await page2.goto(`/board/${seedUser.workspaceId}`);
    await expect(page2.getByRole('heading', { name: /board/i })).toBeVisible({ timeout: 15_000 });

    // Get first column id for creating task
    const columnsRes = await fetch(`${apiBase}/api/workspaces/${seedUser.workspaceId}/board`, {
      headers: { cookie },
    });
    const columnsData = await columnsRes.json();
    const firstColumnId = columnsData.data[0].id;

    // User A creates a task via API
    const createRes = await fetch(`${apiBase}/api/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        workspaceId: seedUser.workspaceId,
        columnId: firstColumnId,
        title: 'Realtime sync test task',
      }),
    });
    expect(createRes.ok).toBeTruthy();
    const { task: createdTask } = await createRes.json();
    void createdTask;

    // User B should see the new task appear on the board (via Socket.IO invalidation)
    await expect(page2.getByText('Realtime sync test task')).toBeVisible({ timeout: 10_000 });

    // Cleanup
    await prisma.user.delete({ where: { id: user2.id } });
    await ctx2.close();
  });

  test('task moved by user A updates on user B board via Socket.IO', async ({
    page,
    browser,
    seedUser,
  }) => {
    const apiBase = process.env.API_BASE_URL ?? 'http://localhost:3000';
    const cookie = await apiLogin(seedUser.email, seedUser.password);

    // Second user
    const user2Email = `e2e-rt3-${Date.now()}@flow-desk.app`;
    const user2 = await prisma.user.create({
      data: { email: user2Email, name: 'RT User 3' },
    });
    await prisma.user.update({
      where: { id: user2.id },
      data: { passwordHash: await import('bcryptjs').then((b) => b.hash('e2epass123', 10)) },
    });
    await prisma.workspaceMember.create({
      data: { userId: user2.id, workspaceId: seedUser.workspaceId, role: 'MEMBER' },
    });

    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await page2.addInitScript(() => {
      const s = document.createElement('style');
      s.textContent = '.tsqd-parent-container { display: none !important }';
      document.head.appendChild(s);
    });
    await loginViaUI(page2, user2Email, 'e2epass123');

    // Both on the board
    await page.goto('/login');
    await page.getByLabel('Email').fill(seedUser.email);
    await page.getByLabel('Password').fill(seedUser.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/$|\/(board|dashboard)/, { timeout: 15_000 });

    await page.goto(`/board/${seedUser.workspaceId}`);
    await expect(page.getByRole('heading', { name: /board/i })).toBeVisible({ timeout: 15_000 });
    await page2.goto(`/board/${seedUser.workspaceId}`);
    await expect(page2.getByRole('heading', { name: /board/i })).toBeVisible({ timeout: 15_000 });

    // Get columns
    const columnsRes = await fetch(`${apiBase}/api/workspaces/${seedUser.workspaceId}/board`, {
      headers: { cookie },
    });
    const columnsData = await columnsRes.json();
    const col1Id = columnsData.data[0].id;
    const col2Id = columnsData.data[1].id;

    // Create task in column 1
    const createRes = await fetch(`${apiBase}/api/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        workspaceId: seedUser.workspaceId,
        columnId: col1Id,
        title: 'Move me task',
      }),
    });
    const { task: createdTask } = await createRes.json();

    // Wait for card visible on both
    await expect(page.getByText('Move me task')).toBeVisible({ timeout: 10_000 });
    await expect(page2.getByText('Move me task')).toBeVisible({ timeout: 10_000 });

    // User A moves task to column 2 via API
    const moveRes = await fetch(`${apiBase}/api/tasks/${createdTask.id}/move`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        columnId: col2Id,
        position: 0,
        version: createdTask.version,
      }),
    });
    expect(moveRes.ok).toBeTruthy();

    // User B should see the card move to column 2
    const secondColumn = page2.locator('[data-column-id]').nth(1);
    await expect(secondColumn.getByText('Move me task')).toBeVisible({ timeout: 10_000 });

    // Cleanup
    await prisma.user.delete({ where: { id: user2.id } });
    await ctx2.close();
  });
});
