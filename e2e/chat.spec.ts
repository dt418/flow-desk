import { test, expect, loginViaUI, apiLogin } from './fixtures';

test.describe('Chat @smoke', () => {
  test('create channel and send message', async ({ page, seedUser }) => {
    await loginViaUI(page, seedUser.email, seedUser.password);
    await page.goto(`/workspaces/${seedUser.workspaceId}/chat`);
    await expect(page.getByText('Select a channel')).toBeVisible();
    await expect(page.getByText('No channels yet')).toBeVisible();

    await page.getByTitle('Create channel').click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByPlaceholder('e.g. general').fill('general');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('Channel created')).toBeVisible();
    await expect(page.getByText('# general')).toBeVisible();

    await page.getByText('# general').click();
    await expect(page.getByPlaceholder('Message #general')).toBeVisible();

    await page.getByPlaceholder('Message #general').fill('Hello world!');
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(page.getByText('Hello world!')).toBeVisible({ timeout: 5000 });
  });

  test('send multiple messages and see scroll', async ({ page, seedUser, apiContext }) => {
    const cookie = await apiLogin(seedUser.email, seedUser.password);

    await fetch(`${apiContext.baseURL}/api/workspaces/${seedUser.workspaceId}/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        workspaceId: seedUser.workspaceId,
        name: 'general',
        isPrivate: false,
        scope: 'WORKSPACE',
      }),
    });

    const chRes = await fetch(
      `${apiContext.baseURL}/api/workspaces/${seedUser.workspaceId}/channels`,
      { headers: { cookie } },
    );
    const chData = (await chRes.json()) as { data: Array<{ id: string }> };
    const channelId = chData.data[0]!.id;

    for (let i = 0; i < 5; i++) {
      await fetch(
        `${apiContext.baseURL}/api/workspaces/${seedUser.workspaceId}/channels/${channelId}/messages`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie },
          body: JSON.stringify({ content: `Seed message ${i}`, mentionedUserIds: [] }),
        },
      );
    }

    await loginViaUI(page, seedUser.email, seedUser.password);
    await page.goto(`/workspaces/${seedUser.workspaceId}/chat`);
    await page.getByText('# general').click();

    for (let i = 0; i < 5; i++) {
      await expect(page.getByText(`Seed message ${i}`)).toBeVisible();
    }

    await page.getByPlaceholder('Message #general').fill('Final message');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('Final message')).toBeVisible();
  });

  test('task chat tab visible in edit modal', async ({ page, seedUser, apiContext }) => {
    const cookie = await apiLogin(seedUser.email, seedUser.password);

    await fetch(
      `${apiContext.baseURL}/api/workspaces/${seedUser.workspaceId}/board/columns`,
      { headers: { cookie } },
    ).catch(() => {});

    await loginViaUI(page, seedUser.email, seedUser.password);
    await page.goto(`/board/${seedUser.workspaceId}`);

    await page.getByRole('button', { name: /new task/i }).click();
    await page.getByLabel('Title').fill('Chat task');
    await page.getByRole('button', { name: /create task/i }).click();
    await expect(page.getByText('Chat task')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Chat task')).toBeVisible();

    await page.getByText('Chat task').click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await expect(page.getByRole('button', { name: /chat/i })).toBeVisible();
    await page.getByRole('button', { name: /chat/i }).click();

    await expect(page.getByPlaceholder('Chat…')).toBeVisible();

    await page.getByPlaceholder('Chat…').fill('Task discussion');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('Task discussion')).toBeVisible({ timeout: 5000 });
  });
});
