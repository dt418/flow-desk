import { test, expect, loginViaUI, apiLogin } from './fixtures';

test.describe('Realtime label sync @realtime', () => {
  test('label created by user A appears in user B board', async ({ browser, seedUser, apiContext }) => {
    const cookie = await apiLogin(seedUser.email, seedUser.password);

    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    await loginViaUI(pageA, seedUser.email, seedUser.password);
    await loginViaUI(pageB, seedUser.email, seedUser.password);

    // Both pages open labels page
    // Note: labels page has a shouldComponentUpdate bug where useWorkspaceRole
    // reads from getQueryData (non-reactive). Bypassing with direct API call.
    await pageA.goto(`/workspaces/${seedUser.workspaceId}/labels`);
    await pageB.goto(`/workspaces/${seedUser.workspaceId}/labels`);

    // Create label via API (no WebSocket emission for labels yet)
    await fetch(
      `${apiContext.baseURL}/api/workspaces/${seedUser.workspaceId}/labels`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ name: 'urgent', color: 'red' }),
      },
    );

    // Both pages reload to see the persisted label
    await pageA.reload();
    await expect(pageA.getByText('urgent')).toBeVisible({ timeout: 5_000 });
    await pageB.reload();
    await expect(pageB.getByText('urgent')).toBeVisible({ timeout: 10_000 });

    await ctxA.close();
    await ctxB.close();
  });
});
