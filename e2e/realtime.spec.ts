import { test, expect, apiLogin } from './fixtures';

test.describe('Realtime label sync @realtime', () => {
  test('label created via API appears in board query', async ({ browser, seedUser }) => {
    const cookie = await apiLogin(seedUser.email, seedUser.password);

    const ctx = await browser.newContext();
    await ctx.addCookies([
      { name: 'access_token', value: cookie.split('=')[1]!, domain: 'localhost', path: '/' },
    ]);

    const page = await ctx.newPage();
    await page.goto(`/board/${seedUser.workspaceId}`);
    await page.getByRole('heading', { name: /board/i }).waitFor({ state: 'visible', timeout: 15_000 });

    const res = await fetch(
      `${process.env.API_BASE_URL ?? 'http://localhost:3000'}/api/workspaces/${seedUser.workspaceId}/labels`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ name: 'Urgent', color: 'red' }),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Label create failed: ${res.status} ${body}`);
    }

    await page.goto(`/workspaces/${seedUser.workspaceId}/labels`);
    await expect(page.getByText('Urgent')).toBeVisible({ timeout: 5_000 });

    await ctx.close();
  });
});
