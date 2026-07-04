import { test, expect, loginViaUI } from './fixtures';

test.describe('Workspace switcher → create workspace @smoke', () => {
  test('opens create dialog from a board page via sidebar switcher', async ({ page, seedUser }) => {
    await loginViaUI(page, seedUser.email, seedUser.password);

    // Land on a board page (not the dashboard) so we prove the dialog opens
    // from anywhere, not just from the dashboard's own "New workspace" button.
    await page.goto(`/board/${seedUser.workspaceId}`);
    await expect(page.getByRole('heading', { name: /board/i })).toBeVisible();

    // Open the workspace switcher dropdown in the sidebar.
    const switcherTrigger = page
      .locator('aside')
      .getByRole('button', { name: seedUser.workspaceName });
    await switcherTrigger.click();

    // Click "New workspace" in the dropdown.
    await page.getByRole('menuitem', { name: /new workspace/i }).click();

    // The create dialog must open directly from the switcher.
    await expect(page.getByRole('heading', { name: /^new workspace$/i })).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByLabel('Name')).toBeVisible();
    await expect(page.getByLabel('Slug')).toBeVisible();

    // Fill the form and submit.
    const name = `Switcher WS ${Date.now()}`;
    await page.getByLabel('Name').fill(name);
    await page.getByRole('button', { name: /create workspace/i }).click();

    // Should navigate to the new workspace's board.
    await page.waitForURL(/\/board\/(?!$)/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/board\//);
  });
});
