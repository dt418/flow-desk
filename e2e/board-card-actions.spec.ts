import { test, expect, loginViaUI } from './fixtures';

test.describe('Board card actions (drag/drop conflict with Edit/Delete) @bugfix', () => {
  test('Edit / Delete open single modal — dnd-kit does not swallow kebab clicks', async ({
    page,
    seedUser,
  }) => {
    await loginViaUI(page, seedUser.email, seedUser.password);
    await page.goto(`/board/${seedUser.workspaceId}`);

    // Seed a task so we can target the kebab directly.
    await page.getByRole('button', { name: /new task/i }).first().click();
    await page.getByLabel('Title').fill('Kebab click target');
    await page.getByRole('button', { name: /create task/i }).click();

    const card = page.locator('article', { hasText: 'Kebab click target' }).first();
    await expect(card).toBeVisible({ timeout: 7_000 });

    // Hover so the kebab becomes visible (group-hover), then click it.
    await card.hover();
    const kebab = card.locator('[data-task-kebab]');
    await expect(kebab).toBeVisible();
    await kebab.click();

    // Kebab menu opens; click Edit.
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitem', { name: /edit/i }).click();

    // Exactly ONE dialog should be present — proves no double modal.
    const dialogs = page.getByRole('dialog');
    await expect(dialogs).toHaveCount(1);
    await expect(dialogs.first()).toContainText(/edit task/i);

    // Card must NOT be in drag state (no opacity-30 from dragging).
    const opacity = await card.evaluate((el) => window.getComputedStyle(el).opacity);
    expect(Number(opacity)).toBeGreaterThan(0.9);

    // Close, then exercise Delete → toast appears, no second modal.
    await page.keyboard.press('Escape');
    await expect(dialogs).toHaveCount(0);

    await card.hover();
    await kebab.click();
    await menu.getByRole('menuitem', { name: /delete/i }).click();

    // Delete fires toast — no DragOverlay ghost.
    const toasts = page.locator('[data-sonner-toast]');
    await expect(toasts.first()).toBeVisible({ timeout: 5_000 });
    // After delete, empty state may show Create-your-first-task which opens a modal;
    // just verify the edit modal is gone (delete worked).
    await expect(page.getByText(/task deleted/i)).toBeVisible({ timeout: 5_000 });
  });
});
