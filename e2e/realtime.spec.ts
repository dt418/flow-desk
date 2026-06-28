import { test, expect } from './fixtures';

test.describe('Realtime label sync @realtime', () => {
  test('board loads with seeded workspace labels', async ({ page, seedUser }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(seedUser.email);
    await page.getByLabel('Password').fill(seedUser.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/$|\/(board|dashboard)/, { timeout: 15_000 });

    await page.goto(`/board/${seedUser.workspaceId}`);
    await expect(page.getByRole('heading', { name: /board/i })).toBeVisible({ timeout: 15_000 });
  });
});
