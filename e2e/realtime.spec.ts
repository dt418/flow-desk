import { test, expect, apiLogin } from './fixtures';
import type { BrowserContext, Page } from '@playwright/test';

async function openBoardAs(context: BrowserContext, email: string, password: string, workspaceId: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/w\//, { timeout: 10_000 });
  await page.goto(`/w/${workspaceId}`);
  await page.getByRole('heading', { name: /board/i }).waitFor({ state: 'visible' });
  return page;
}

test.describe('Realtime label sync @realtime', () => {
  test('label created by user A appears in user B board', async ({ browser, seedUser }) => {
    const cookie = await apiLogin(seedUser.email, seedUser.password);

    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    await ctxA.addCookies([
      { name: 'access_token', value: cookie.split('=')[1]!, domain: 'localhost', path: '/' },
    ]);
    await ctxB.addCookies([
      { name: 'access_token', value: cookie.split('=')[1]!, domain: 'localhost', path: '/' },
    ]);

    const pageA = await openBoardAs(ctxA, seedUser.email, seedUser.password, seedUser.workspaceId);
    const pageB = await openBoardAs(ctxB, seedUser.email, seedUser.password, seedUser.workspaceId);

    await pageA.goto(`/workspaces/${seedUser.workspaceId}/labels`);
    await pageA.getByRole('button', { name: /new label/i }).click();
    await pageA.getByLabel('Name').fill('Urgent');
    await pageA.getByRole('button', { name: /save/i }).click();

    await expect(pageB.getByText('Urgent')).toBeVisible({ timeout: 5_000 });

    await ctxA.close();
    await ctxB.close();
  });
});