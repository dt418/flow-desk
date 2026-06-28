import { test, expect, loginViaUI, apiLogin } from './fixtures';

test.describe('Critical path @smoke', () => {
  test('login → workspace → create task → add label', async ({ page, seedUser, apiContext }) => {
    const cookie = await apiLogin(seedUser.email, seedUser.password);

    await fetch(
      `${apiContext.baseURL}/api/workspaces/${seedUser.workspaceId}/labels`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ name: 'urgent', color: 'red' }),
      },
    );

    await loginViaUI(page, seedUser.email, seedUser.password);
    await page.goto(`/board/${seedUser.workspaceId}`);
    await expect(page.getByRole('heading', { name: /board/i })).toBeVisible();

    await page.getByRole('button', { name: /new task/i }).click();
    await page.getByLabel('Title').fill('Ship F2');
    await page.getByRole('button', { name: /create task/i }).click();

    const card = page.getByText('Ship F2').first();
    await expect(card).toBeVisible({ timeout: 5_000 });

    // Assign label via card's inline "Edit labels" popover
    await page.getByRole('button', { name: 'Edit labels', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'urgent' }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-task-label-trigger]').getByText('urgent')).toBeVisible();
  });
});
