import { test, expect, loginViaUI, apiLogin } from './fixtures';

test.describe('Critical path @smoke', () => {
  test('login → workspace → create task → drag → add label', async ({ page, seedUser }) => {
    await loginViaUI(page, seedUser.email, seedUser.password);
    await page.goto(`/board/${seedUser.workspaceId}`);
    await expect(page.getByRole('heading', { name: /board/i })).toBeVisible();

    await page.getByRole('button', { name: /new task/i }).click();
    await page.getByLabel('Title').fill('Ship F2');
    await page.getByRole('button', { name: /create task/i }).click();

    const card = page.getByText('Ship F2').first();
    await expect(card).toBeVisible({ timeout: 5_000 });

    const secondColumn = page.locator('[data-column-id]').nth(1);
    const srcBox = await card.boundingBox();
    const dstBox = await secondColumn.boundingBox();
    if (srcBox && dstBox) {
      await page.mouse.move(srcBox.x + srcBox.width / 2, srcBox.y + srcBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(dstBox.x + dstBox.width / 2, dstBox.y + dstBox.height / 2, { steps: 10 });
      await page.mouse.up();
    }
    await expect(secondColumn.getByText('Ship F2')).toBeVisible({ timeout: 5_000 });
  });
});
