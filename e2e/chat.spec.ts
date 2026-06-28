import { test, expect } from './fixtures';

test.describe('Chat @smoke', () => {
  test('chat page loads with channels sidebar', async ({ page, seedUser }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(seedUser.email);
    await page.getByLabel('Password').fill(seedUser.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/$|\/(board|dashboard)/, { timeout: 15_000 });

    await page.goto(`/workspaces/${seedUser.workspaceId}/chat`);
    await expect(page.getByText('Select a channel')).toBeVisible({ timeout: 10_000 });
  });
});
