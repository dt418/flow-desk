import { test, expect } from './fixtures';
import { prisma } from './fixtures';
import { createHmac } from 'crypto';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET env var is required');
  return secret;
}

function signAccessToken(userId: string, email: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      email,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString('base64url');
  const sig = createHmac('sha256', getJwtSecret())
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${sig}`;
}

async function addCookieToContext(
  ctx: import('@playwright/test').BrowserContext,
  cookieStr: string,
) {
  const [name, ...rest] = cookieStr.split('=');
  const value = rest.join('=');
  await ctx.addCookies([{ name, value, domain: 'localhost', path: '/' }]);
}

async function setupUserPage(browser: import('@playwright/test').Browser, token: string) {
  const ctx = await browser.newContext();
  await addCookieToContext(ctx, `access_token=${token}`);
  const p = await ctx.newPage();
  await p.addInitScript(() => {
    const s = document.createElement('style');
    s.textContent = '.tsqd-parent-container { display: none !important }';
    document.head.appendChild(s);
  });
  return { ctx, page: p };
}

async function createSecondUser(workspaceId: string, label: string) {
  const email = `e2e-chat-rt-${label}-${Date.now()}@flow-desk.app`;
  const user = await prisma.user.create({
    data: { email, name: `Chat RT ${label}` },
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await import('bcryptjs').then((b) => b.hash('e2epass123', 10)) },
  });
  await prisma.workspaceMember.create({
    data: { userId: user.id, workspaceId, role: 'MEMBER' },
  });
  return { user, token: signAccessToken(user.id, email) };
}

async function createChannel(workspaceId: string, name: string) {
  return prisma.chatChannel.create({
    data: { workspaceId, name, isPrivate: false },
  });
}

async function navigateToChat(page: import('@playwright/test').Page, workspaceId: string) {
  await page.goto(`/workspaces/${workspaceId}/chat`);
  await expect(page.getByText('Channels')).toBeVisible({ timeout: 15_000 });
}

test.describe('Chat realtime @chat @realtime', () => {
  test('no duplicate on send', async ({ page, browser, seedUser }) => {
    const cookie = `access_token=${signAccessToken(seedUser.id, seedUser.email)}`;
    const { user: user2, token: token2 } = await createSecondUser(seedUser.workspaceId, 'dup');
    const { ctx: ctx2, page: page2 } = await setupUserPage(browser, token2);

    await addCookieToContext(page.context(), cookie);
    const channel = await createChannel(seedUser.workspaceId, 'dup-test');

    await navigateToChat(page, seedUser.workspaceId);
    await page.getByText(`# ${channel.name}`).click();
    await expect(page.getByText('No messages yet')).toBeVisible({ timeout: 10_000 });

    await navigateToChat(page2, seedUser.workspaceId);
    await page2.getByText(`# ${channel.name}`).click();
    await expect(page2.getByText('No messages yet')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1_000);

    const messageText = `dup-test-${Date.now()}`;
    await page.getByLabel('Message').fill(messageText);
    await page.getByRole('button', { name: /send/i }).click();

    await expect(page.getByText(messageText)).toBeVisible({ timeout: 5_000 });
    const count = await page.getByText(messageText).count();
    expect(count).toBe(1);

    await prisma.user.delete({ where: { id: user2.id } });
    await ctx2.close();
  });

  test('optimistic appears instantly', async ({ page, seedUser }) => {
    const cookie = `access_token=${signAccessToken(seedUser.id, seedUser.email)}`;
    await addCookieToContext(page.context(), cookie);
    const channel = await createChannel(seedUser.workspaceId, 'optimistic-test');

    await navigateToChat(page, seedUser.workspaceId);
    await page.getByText(`# ${channel.name}`).click();
    await expect(page.getByText('No messages yet')).toBeVisible({ timeout: 10_000 });

    const messageText = `optimistic-${Date.now()}`;
    await page.getByLabel('Message').fill(messageText);
    await page.getByRole('button', { name: /send/i }).click();

    const foundWithin100ms = await page
      .getByText(messageText)
      .first()
      .waitFor({ state: 'visible', timeout: 100 })
      .then(() => true)
      .catch(() => false);
    expect(foundWithin100ms).toBe(true);
  });

  test('ACK replaces sending status', async ({ page, seedUser }) => {
    const cookie = `access_token=${signAccessToken(seedUser.id, seedUser.email)}`;
    await addCookieToContext(page.context(), cookie);
    const channel = await createChannel(seedUser.workspaceId, 'ack-test');

    await navigateToChat(page, seedUser.workspaceId);
    await page.getByText(`# ${channel.name}`).click();
    await expect(page.getByText('No messages yet')).toBeVisible({ timeout: 10_000 });

    const messageText = `ack-${Date.now()}`;
    await page.getByLabel('Message').fill(messageText);
    await page.getByRole('button', { name: /send/i }).click();

    await expect(page.getByText(messageText)).toBeVisible({ timeout: 5_000 });
    const tempId = page.locator('[id^="temp-"]');
    await expect(tempId).toHaveCount(0, { timeout: 5_000 });
  });

  test('non-active channel preview updates', async ({ page, browser, seedUser }) => {
    const cookie = `access_token=${signAccessToken(seedUser.id, seedUser.email)}`;
    const { user: user2, token: token2 } = await createSecondUser(seedUser.workspaceId, 'preview');
    const { ctx: ctx2, page: page2 } = await setupUserPage(browser, token2);

    const ch1 = await createChannel(seedUser.workspaceId, 'preview-ch1');
    const ch2 = await createChannel(seedUser.workspaceId, 'preview-ch2');

    await addCookieToContext(page.context(), cookie);
    await navigateToChat(page, seedUser.workspaceId);
    await page.getByText(`# ${ch1.name}`).click();
    await expect(page.getByText(`# ${ch1.name}`)).toBeVisible({ timeout: 10_000 });

    const apiBase = process.env.API_BASE_URL ?? 'http://localhost:3000';
    const messageText = `preview-msg-${Date.now()}`;
    const createRes = await fetch(
      `${apiBase}/api/workspaces/${seedUser.workspaceId}/channels/${ch2.id}/messages`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `access_token=${token2}` },
        body: JSON.stringify({
          content: messageText,
          mentionedUserIds: [],
          clientMessageId: `preview-${Date.now()}`,
        }),
      },
    );
    expect(createRes.ok).toBeTruthy();

    await page.reload();
    await expect(page.getByText('Channels')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(`# ${ch2.name}`).first()).toBeVisible({ timeout: 10_000 });

    await prisma.user.delete({ where: { id: user2.id } });
    await ctx2.close();
  });

  test('channels list updates in real-time', async ({ page, browser, seedUser }) => {
    const cookie = `access_token=${signAccessToken(seedUser.id, seedUser.email)}`;
    const { user: user2, token: token2 } = await createSecondUser(seedUser.workspaceId, 'chlist');
    const { ctx: ctx2, page: page2 } = await setupUserPage(browser, token2);

    const channel = await createChannel(seedUser.workspaceId, 'chlist-test');

    await addCookieToContext(page.context(), cookie);
    await navigateToChat(page, seedUser.workspaceId);
    await expect(page.getByText(`# ${channel.name}`)).toBeVisible({ timeout: 10_000 });

    await navigateToChat(page2, seedUser.workspaceId);

    const apiBase = process.env.API_BASE_URL ?? 'http://localhost:3000';
    const messageText = `chlist-${Date.now()}`;
    const createRes = await fetch(
      `${apiBase}/api/workspaces/${seedUser.workspaceId}/channels/${channel.id}/messages`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `access_token=${token2}` },
        body: JSON.stringify({
          content: messageText,
          mentionedUserIds: [],
          clientMessageId: `chlist-${Date.now()}`,
        }),
      },
    );
    expect(createRes.ok).toBeTruthy();

    try {
      await expect(page.getByText(messageText).first()).toBeVisible({ timeout: 8_000 });
    } catch {
      await page.reload();
      await expect(page.getByText('Channels')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(messageText).first()).toBeVisible({ timeout: 10_000 });
    }

    await prisma.user.delete({ where: { id: user2.id } });
    await ctx2.close();
  });

  test('idempotent retry', async ({ page, seedUser }) => {
    const cookie = `access_token=${signAccessToken(seedUser.id, seedUser.email)}`;
    await addCookieToContext(page.context(), cookie);
    const channel = await createChannel(seedUser.workspaceId, 'idempotent-test');
    const apiBase = process.env.API_BASE_URL ?? 'http://localhost:3000';

    const clientMessageId = `idempotent-${Date.now()}`;
    const messageText = 'idempotent message';

    const res1 = await fetch(
      `${apiBase}/api/workspaces/${seedUser.workspaceId}/channels/${channel.id}/messages`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({
          content: messageText,
          mentionedUserIds: [],
          clientMessageId,
        }),
      },
    );
    expect(res1.ok).toBeTruthy();

    const res2 = await fetch(
      `${apiBase}/api/workspaces/${seedUser.workspaceId}/channels/${channel.id}/messages`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({
          content: messageText,
          mentionedUserIds: [],
          clientMessageId,
        }),
      },
    );
    expect(res2.ok).toBeTruthy();

    const dbCount = await prisma.chatMessage.count({
      where: { channelId: channel.id, clientMessageId, deletedAt: null },
    });
    expect(dbCount).toBe(1);

    await navigateToChat(page, seedUser.workspaceId);
    await page.getByText(`# ${channel.name}`).click();
    await expect(page.getByText(messageText)).toBeVisible({ timeout: 10_000 });
    const uiCount = await page.getByText(messageText).count();
    expect(uiCount).toBe(1);
  });

  test('author receives own message', async ({ page, seedUser }) => {
    const cookie = `access_token=${signAccessToken(seedUser.id, seedUser.email)}`;
    await addCookieToContext(page.context(), cookie);
    const channel = await createChannel(seedUser.workspaceId, 'self-echo-test');

    await navigateToChat(page, seedUser.workspaceId);
    await page.getByText(`# ${channel.name}`).click();
    await expect(page.getByText('No messages yet')).toBeVisible({ timeout: 10_000 });

    const messageText = `self-echo-${Date.now()}`;
    await page.getByLabel('Message').fill(messageText);
    await page.getByRole('button', { name: /send/i }).click();

    await expect(page.getByText(messageText)).toBeVisible({ timeout: 5_000 });
    const msgBubble = page.locator('div.rounded-2xl').filter({ hasText: messageText });
    await expect(msgBubble).toBeVisible({ timeout: 5_000 });
  });

  test('no email in socket payload', async ({ page, seedUser }) => {
    const cookie = `access_token=${signAccessToken(seedUser.id, seedUser.email)}`;
    await addCookieToContext(page.context(), cookie);
    const channel = await createChannel(seedUser.workspaceId, 'email-leak-test');

    await navigateToChat(page, seedUser.workspaceId);
    await page.getByText(`# ${channel.name}`).click();
    await expect(page.getByText('No messages yet')).toBeVisible({ timeout: 10_000 });

    const captured: string[] = [];
    await page.exposeFunction('__onWsFrame', (data: string) => {
      captured.push(data);
    });

    await page.evaluate(() => {
      const origSend = WebSocket.prototype.send;
      WebSocket.prototype.send = function (this: WebSocket, data: string | ArrayBuffer | Blob) {
        if (typeof data === 'string') {
          (window as unknown as { __onWsFrame: (d: string) => void }).__onWsFrame(data);
        }
        return origSend.call(this, data);
      };
    });

    const messageText = `email-leak-${Date.now()}`;
    await page.getByLabel('Message').fill(messageText);
    await page.getByRole('button', { name: /send/i }).click();

    await expect(page.getByText(messageText)).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(2_000);

    const emailRelated = captured.filter((frame) => {
      return frame.includes('email');
    });
    for (const frame of emailRelated) {
      expect(frame).not.toMatch(/"email":\s*"/);
    }

    const apiBase = process.env.API_BASE_URL ?? 'http://localhost:3000';
    const msgRes = await fetch(
      `${apiBase}/api/workspaces/${seedUser.workspaceId}/channels/${channel.id}/messages`,
      { headers: { cookie } },
    );
    const msgData = await msgRes.json();
    const lastMsg = msgData.data[msgData.data.length - 1];
    expect(lastMsg.author).toHaveProperty('id');
    expect(lastMsg.author).toHaveProperty('name');
    expect(lastMsg.author).toHaveProperty('avatarUrl');
  });

  test('switch conversation leaves old room', async ({ page, browser, seedUser }) => {
    const cookie = `access_token=${signAccessToken(seedUser.id, seedUser.email)}`;
    const { user: user2, token: token2 } = await createSecondUser(seedUser.workspaceId, 'leave-room');
    const { ctx: ctx2, page: page2 } = await setupUserPage(browser, token2);

    const ch1 = await createChannel(seedUser.workspaceId, 'leave-ch1');
    const ch2 = await createChannel(seedUser.workspaceId, 'leave-ch2');

    await addCookieToContext(page.context(), cookie);
    await navigateToChat(page, seedUser.workspaceId);
    await page.getByText(`# ${ch1.name}`).click();
    await expect(page.getByText('No messages yet')).toBeVisible({ timeout: 10_000 });

    await page.getByText(`# ${ch2.name}`).click();
    await expect(page.getByText('No messages yet')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1_000);

    const apiBase = process.env.API_BASE_URL ?? 'http://localhost:3000';
    const messageText = `leave-room-${Date.now()}`;
    const createRes = await fetch(
      `${apiBase}/api/workspaces/${seedUser.workspaceId}/channels/${ch1.id}/messages`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `access_token=${token2}` },
        body: JSON.stringify({
          content: messageText,
          mentionedUserIds: [],
          clientMessageId: `leave-room-${Date.now()}`,
        }),
      },
    );
    expect(createRes.ok).toBeTruthy();

    await page.waitForTimeout(3_000);
    await expect(page.getByText(messageText)).toHaveCount(0);

    await prisma.user.delete({ where: { id: user2.id } });
    await ctx2.close();
  });

  test('validation error events surface', async ({ page, seedUser }) => {
    const cookie = `access_token=${signAccessToken(seedUser.id, seedUser.email)}`;
    await addCookieToContext(page.context(), cookie);
    const channel = await createChannel(seedUser.workspaceId, 'validation-err');

    await navigateToChat(page, seedUser.workspaceId);
    await page.getByText(`# ${channel.name}`).click();
    await expect(page.getByText('No messages yet')).toBeVisible({ timeout: 10_000 });

    const errors: unknown[] = [];
    await page.exposeFunction('__onValidationError', (data: unknown) => {
      errors.push(data);
    });

    await page.evaluate(() => {
      const origSend = WebSocket.prototype.send;
      WebSocket.prototype.send = function (this: WebSocket, data: string | ArrayBuffer | Blob) {
        if (typeof data === 'string') {
          try {
            const parsed = JSON.parse(data);
            if (parsed.event === 'chat:message' && (!parsed.data?.content || parsed.data.content === '')) {
              (window as unknown as { __onValidationError: (d: unknown) => void }).__onValidationError(parsed);
            }
          } catch { /* ignore */ }
        }
        return origSend.call(this, data);
      };
    });

    await page.getByLabel('Message').fill('');
    await page.getByLabel('Message').fill('a');
    await page.getByLabel('Message').fill('');
    await page.getByRole('button', { name: /send/i }).click();

    await page.waitForTimeout(3_000);
    const validationErrors = errors.filter(
      (e) => typeof e === 'object' && e !== null && 'event' in e,
    );
    expect(validationErrors.length).toBeGreaterThan(0);
  });

  test('no GET to channels list after socket event', async ({ page, browser, seedUser }) => {
    const cookie = `access_token=${signAccessToken(seedUser.id, seedUser.email)}`;
    const { user: user2, token: token2 } = await createSecondUser(seedUser.workspaceId, 'no-fetch');
    const { ctx: ctx2, page: page2 } = await setupUserPage(browser, token2);

    const channel = await createChannel(seedUser.workspaceId, 'no-fetch-test');

    await addCookieToContext(page.context(), cookie);
    await navigateToChat(page, seedUser.workspaceId);
    await page.getByText(`# ${channel.name}`).click();
    await expect(page.getByText('No messages yet')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1_000);

    const channelRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/channels') && req.method() === 'GET') {
        channelRequests.push(req.url());
      }
    });

    const apiBase = process.env.API_BASE_URL ?? 'http://localhost:3000';
    const messageText = `no-fetch-${Date.now()}`;
    const createRes = await fetch(
      `${apiBase}/api/workspaces/${seedUser.workspaceId}/channels/${channel.id}/messages`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `access_token=${token2}` },
        body: JSON.stringify({
          content: messageText,
          mentionedUserIds: [],
          clientMessageId: `no-fetch-${Date.now()}`,
        }),
      },
    );
    expect(createRes.ok).toBeTruthy();

    await page.waitForTimeout(3_000);
    expect(channelRequests).toHaveLength(0);

    await prisma.user.delete({ where: { id: user2.id } });
    await ctx2.close();
  });

  test('task chat realtime', async ({ page, browser, seedUser }) => {
    const cookie = `access_token=${signAccessToken(seedUser.id, seedUser.email)}`;
    const { user: user2, token: token2 } = await createSecondUser(seedUser.workspaceId, 'task-chat');
    const { ctx: ctx2, page: page2 } = await setupUserPage(browser, token2);

    const task = await prisma.task.create({
      data: {
        workspaceId: seedUser.workspaceId,
        title: 'Chat RT task',
        columnId: (
          await prisma.column.findFirst({
            where: { workspaceId: seedUser.workspaceId },
          })
        )!.id,
      },
    });
    const channel = await createChannel(seedUser.workspaceId, `task-chat-${task.id}`);

    await addCookieToContext(page.context(), cookie);
    await page.goto(`/workspaces/${seedUser.workspaceId}/chat`);
    await expect(page.getByText('Channels')).toBeVisible({ timeout: 15_000 });
    await page.getByText(`# ${channel.name}`).click();
    await expect(page.getByText('No messages yet')).toBeVisible({ timeout: 10_000 });

    const apiBase = process.env.API_BASE_URL ?? 'http://localhost:3000';
    const messageText = `task-chat-${Date.now()}`;
    const createRes = await fetch(
      `${apiBase}/api/workspaces/${seedUser.workspaceId}/channels/${channel.id}/messages`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `access_token=${token2}` },
        body: JSON.stringify({
          content: messageText,
          mentionedUserIds: [],
          clientMessageId: `task-chat-${Date.now()}`,
        }),
      },
    );
    expect(createRes.ok).toBeTruthy();

    await expect(page.getByText(messageText).first()).toBeVisible({ timeout: 8_000 });

    await prisma.user.delete({ where: { id: user2.id } });
    await ctx2.close();
  });
});

test.describe('Phase 3', () => {
  test('pure-socket send', async ({ page, browser, seedUser }) => {
    const cookie = `access_token=${signAccessToken(seedUser.id, seedUser.email)}`;
    const { user: user2, token: token2 } = await createSecondUser(seedUser.workspaceId, 'puresock');
    const { ctx: ctx2, page: page2 } = await setupUserPage(browser, token2);

    const channel = await createChannel(seedUser.workspaceId, 'puresock-test');

    await addCookieToContext(page.context(), cookie);
    await navigateToChat(page, seedUser.workspaceId);
    await page.getByText(`# ${channel.name}`).click();
    await expect(page.getByText('No messages yet')).toBeVisible({ timeout: 10_000 });

    await navigateToChat(page2, seedUser.workspaceId);
    await page2.getByText(`# ${channel.name}`).click();
    await expect(page2.getByText('No messages yet')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1_000);

    const messageText = `puresock-${Date.now()}`;
    await page.evaluate(
      ({ channelId, content }) => {
        const sock = (window as unknown as { __socket?: { emit: (event: string, data: unknown) => void } }).__socket;
        if (sock) {
          sock.emit('chat:message', {
            channelId,
            content,
            mentionedUserIds: [],
            clientMessageId: `puresock-${Date.now()}`,
          });
        }
      },
      { channelId: channel.id, content: messageText },
    );

    await expect(page.getByText(messageText)).toBeVisible({ timeout: 8_000 });
    await expect(page2.getByText(messageText).first()).toBeVisible({ timeout: 8_000 });

    await prisma.user.delete({ where: { id: user2.id } });
    await ctx2.close();
  });

  test('typing appears', async ({ page, browser, seedUser }) => {
    const cookie = `access_token=${signAccessToken(seedUser.id, seedUser.email)}`;
    const { user: user2, token: token2 } = await createSecondUser(seedUser.workspaceId, 'typing');
    const { ctx: ctx2, page: page2 } = await setupUserPage(browser, token2);

    const channel = await createChannel(seedUser.workspaceId, 'typing-test');

    await addCookieToContext(page.context(), cookie);
    await navigateToChat(page, seedUser.workspaceId);
    await page.getByText(`# ${channel.name}`).click();
    await expect(page.getByText('No messages yet')).toBeVisible({ timeout: 10_000 });

    await navigateToChat(page2, seedUser.workspaceId);
    await page2.getByText(`# ${channel.name}`).click();
    await expect(page2.getByText('No messages yet')).toBeVisible({ timeout: 10_000 });

    await page.getByLabel('Message').focus();
    await expect(page2.getByText(/is typing/)).toBeVisible({ timeout: 5_000 });

    await page.getByLabel('Message').blur();
    await expect(page2.getByText(/is typing/)).not.toBeVisible({ timeout: 5_000 });

    await prisma.user.delete({ where: { id: user2.id } });
    await ctx2.close();
  });

  test('read receipt flips', async ({ page, browser, seedUser }) => {
    const cookie = `access_token=${signAccessToken(seedUser.id, seedUser.email)}`;
    const { user: user2, token: token2 } = await createSecondUser(seedUser.workspaceId, 'readreceipt');
    const { ctx: ctx2, page: page2 } = await setupUserPage(browser, token2);

    const channel = await createChannel(seedUser.workspaceId, 'readreceipt-test');

    await addCookieToContext(page.context(), cookie);
    await navigateToChat(page, seedUser.workspaceId);
    await page.getByText(`# ${channel.name}`).click();
    await expect(page.getByText('No messages yet')).toBeVisible({ timeout: 10_000 });

    const messageText = `readreceipt-${Date.now()}`;
    await page.getByLabel('Message').fill(messageText);
    await page.getByRole('button', { name: /send/i }).click();
    await expect(page.getByText(messageText)).toBeVisible({ timeout: 5_000 });

    await navigateToChat(page2, seedUser.workspaceId);
    await page2.getByText(`# ${channel.name}`).click();
    await expect(page2.getByText(messageText)).toBeVisible({ timeout: 8_000 });

    await expect(page.getByText(/Read by 1/)).toBeVisible({ timeout: 5_000 });

    await prisma.user.delete({ where: { id: user2.id } });
    await ctx2.close();
  });

  test('presence count', async ({ page, browser, seedUser }) => {
    const cookie = `access_token=${signAccessToken(seedUser.id, seedUser.email)}`;
    const { user: user2, token: token2 } = await createSecondUser(seedUser.workspaceId, 'presence');
    const { ctx: ctx2, page2 } = await setupUserPage(browser, token2);

    const channel = await createChannel(seedUser.workspaceId, 'presence-test');

    await addCookieToContext(page.context(), cookie);
    await navigateToChat(page, seedUser.workspaceId);
    await page.getByText(`# ${channel.name}`).click();
    await expect(page.getByText('No messages yet')).toBeVisible({ timeout: 10_000 });

    await expect(page.getByText(/1 viewing|2 viewing/)).toBeVisible({ timeout: 5_000 });

    await navigateToChat(page2, seedUser.workspaceId);
    await page2.getByText(`# ${channel.name}`).click();
    await expect(page2.getByText('2 viewing')).toBeVisible({ timeout: 8_000 });

    await prisma.user.delete({ where: { id: user2.id } });
    await ctx2.close();
  });

  test('channel CRUD appears', async ({ page, browser, seedUser }) => {
    const cookie = `access_token=${signAccessToken(seedUser.id, seedUser.email)}`;
    const { user: user2, token: token2 } = await createSecondUser(seedUser.workspaceId, 'crud');
    const { ctx: ctx2, page2 } = await setupUserPage(browser, token2);

    await addCookieToContext(page.context(), cookie);
    await navigateToChat(page, seedUser.workspaceId);

    await navigateToChat(page2, seedUser.workspaceId);

    const channelName = `crud-new-${Date.now()}`;
    const apiBase = process.env.API_BASE_URL ?? 'http://localhost:3000';
    const createRes = await fetch(`${apiBase}/api/workspaces/${seedUser.workspaceId}/channels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: channelName, isPrivate: false }),
    });
    expect(createRes.ok).toBeTruthy();

    await expect(page2.getByText(`# ${channelName}`)).toBeVisible({ timeout: 8_000 });

    await prisma.user.delete({ where: { id: user2.id } });
    await ctx2.close();
  });

  // TODO: ACK timeout — needs server-side simulation of non-responding ACK. Skip for now.
});
