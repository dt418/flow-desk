import { test, expect, loginViaUI, apiLogin } from './fixtures';

test.describe('Critical path @smoke', () => {
  test('login → workspace → create task → drag → add label', async ({ page, seedUser }) => {
    await loginViaUI(page, seedUser.email, seedUser.password);
    await page.goto(`/w/${seedUser.workspaceId}`);
    await expect(page.getByRole('heading', { name: /board/i })).toBeVisible();

    await page.getByRole('button', { name: /new task/i }).click();
    await page.getByLabel('Title').fill('Ship F2');
    await page.getByRole('button', { name: /create/i }).click();

    const card = page.getByText('Ship F2').first();
    await expect(card).toBeVisible({ timeout: 5_000 });

    const secondColumn = page.locator('[data-kanban-column]').nth(1);
    await card.dragTo(secondColumn);
    await expect(secondColumn.getByText('Ship F2')).toBeVisible({ timeout: 5_000 });

    await card.click();
    await page.getByRole('button', { name: /add label/i }).click();
    await page.getByRole('option', { name: /urgent/i }).click();
    await expect(page.getByText('urgent', { exact: false })).toBeVisible();
  });
});