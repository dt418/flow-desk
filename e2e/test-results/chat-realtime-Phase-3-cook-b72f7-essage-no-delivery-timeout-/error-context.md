# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: chat-realtime.spec.ts >> Phase 3 >> cookie-based socket auth sends message (no delivery timeout)
- Location: chat-realtime.spec.ts:631:3

# Error details

```
Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
Call log:
  - navigating to "/workspaces/cmratzszw00010tgvvcp89zhs/chat", waiting until "load"

```

# Test source

```ts
  1   | import { test, expect } from './fixtures';
  2   | import { prisma } from './fixtures';
  3   | import { createHmac } from 'crypto';
  4   |
  5   | function getJwtSecret(): string {
  6   |   const secret = process.env.JWT_SECRET;
  7   |   if (!secret) throw new Error('JWT_SECRET env var is required');
  8   |   return secret;
  9   | }
  10  |
  11  | function signAccessToken(userId: string, email: string): string {
  12  |   const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  13  |   const payload = Buffer.from(
  14  |     JSON.stringify({
  15  |       userId,
  16  |       email,
  17  |       iat: Math.floor(Date.now() / 1000),
  18  |       exp: Math.floor(Date.now() / 1000) + 3600,
  19  |     }),
  20  |   ).toString('base64url');
  21  |   const sig = createHmac('sha256', getJwtSecret())
  22  |     .update(`${header}.${payload}`)
  23  |     .digest('base64url');
  24  |   return `${header}.${payload}.${sig}`;
  25  | }
  26  |
  27  | async function addCookieToContext(
  28  |   ctx: import('@playwright/test').BrowserContext,
  29  |   cookieStr: string,
  30  | ) {
  31  |   const [name, ...rest] = cookieStr.split('=');
  32  |   const value = rest.join('=');
  33  |   await ctx.addCookies([{ name, value, domain: 'localhost', path: '/' }]);
  34  | }
  35  |
  36  | async function setupUserPage(browser: import('@playwright/test').Browser, token: string) {
  37  |   const ctx = await browser.newContext();
  38  |   await addCookieToContext(ctx, `access_token=${token}`);
  39  |   const p = await ctx.newPage();
  40  |   await p.addInitScript(() => {
  41  |     const s = document.createElement('style');
  42  |     s.textContent = '.tsqd-parent-container { display: none !important }';
  43  |     document.head.appendChild(s);
  44  |   });
  45  |   return { ctx, page: p };
  46  | }
  47  |
  48  | async function createSecondUser(workspaceId: string, label: string) {
  49  |   const email = `e2e-chat-rt-${label}-${Date.now()}@flow-desk.app`;
  50  |   const user = await prisma.user.create({
  51  |     data: { email, name: `Chat RT ${label}` },
  52  |   });
  53  |   await prisma.user.update({
  54  |     where: { id: user.id },
  55  |     data: { passwordHash: await import('bcryptjs').then((b) => b.hash('e2epass123', 10)) },
  56  |   });
  57  |   await prisma.workspaceMember.create({
  58  |     data: { userId: user.id, workspaceId, role: 'MEMBER' },
  59  |   });
  60  |   return { user, token: signAccessToken(user.id, email) };
  61  | }
  62  |
  63  | async function createChannel(workspaceId: string, name: string) {
  64  |   return prisma.chatChannel.create({
  65  |     data: { workspaceId, name, isPrivate: false },
  66  |   });
  67  | }
  68  |
  69  | async function navigateToChat(page: import('@playwright/test').Page, workspaceId: string) {
> 70  |   await page.goto(`/workspaces/${workspaceId}/chat`);
      |              ^ Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
  71  |   await expect(page.getByText('Channels')).toBeVisible({ timeout: 15_000 });
  72  | }
  73  |
  74  | test.describe('Chat realtime @chat @realtime', () => {
  75  |   test('no duplicate on send', async ({ page, browser, seedUser }) => {
  76  |     const cookie = `access_token=${signAccessToken(seedUser.id, seedUser.email)}`;
  77  |     const { user: user2, token: token2 } = await createSecondUser(seedUser.workspaceId, 'dup');
  78  |     const { ctx: ctx2, page: page2 } = await setupUserPage(browser, token2);
  79  |
  80  |     await addCookieToContext(page.context(), cookie);
  81  |     const channel = await createChannel(seedUser.workspaceId, 'dup-test');
  82  |
  83  |     await navigateToChat(page, seedUser.workspaceId);
  84  |     await page.getByText(`# ${channel.name}`).click();
  85  |     await expect(page.getByText('No messages yet')).toBeVisible({ timeout: 10_000 });
  86  |
  87  |     await navigateToChat(page2, seedUser.workspaceId);
  88  |     await page2.getByText(`# ${channel.name}`).click();
  89  |     await expect(page2.getByText('No messages yet')).toBeVisible({ timeout: 10_000 });
  90  |     await page.waitForTimeout(1_000);
  91  |
  92  |     const messageText = `dup-test-${Date.now()}`;
  93  |     await page.getByLabel('Message').fill(messageText);
  94  |     await page.getByRole('button', { name: /send/i }).click();
  95  |
  96  |     await expect(page.getByText(messageText)).toBeVisible({ timeout: 5_000 });
  97  |     const count = await page.getByText(messageText).count();
  98  |     expect(count).toBe(1);
  99  |
  100 |     await prisma.user.delete({ where: { id: user2.id } });
  101 |     await ctx2.close();
  102 |   });
  103 |
  104 |   test('optimistic appears instantly', async ({ page, seedUser }) => {
  105 |     const cookie = `access_token=${signAccessToken(seedUser.id, seedUser.email)}`;
  106 |     await addCookieToContext(page.context(), cookie);
  107 |     const channel = await createChannel(seedUser.workspaceId, 'optimistic-test');
  108 |
  109 |     await navigateToChat(page, seedUser.workspaceId);
  110 |     await page.getByText(`# ${channel.name}`).click();
  111 |     await expect(page.getByText('No messages yet')).toBeVisible({ timeout: 10_000 });
  112 |
  113 |     const messageText = `optimistic-${Date.now()}`;
  114 |     await page.getByLabel('Message').fill(messageText);
  115 |     await page.getByRole('button', { name: /send/i }).click();
  116 |
  117 |     const foundWithin100ms = await page
  118 |       .getByText(messageText)
  119 |       .first()
  120 |       .waitFor({ state: 'visible', timeout: 100 })
  121 |       .then(() => true)
  122 |       .catch(() => false);
  123 |     expect(foundWithin100ms).toBe(true);
  124 |   });
  125 |
  126 |   test('ACK replaces sending status', async ({ page, seedUser }) => {
  127 |     const cookie = `access_token=${signAccessToken(seedUser.id, seedUser.email)}`;
  128 |     await addCookieToContext(page.context(), cookie);
  129 |     const channel = await createChannel(seedUser.workspaceId, 'ack-test');
  130 |
  131 |     await navigateToChat(page, seedUser.workspaceId);
  132 |     await page.getByText(`# ${channel.name}`).click();
  133 |     await expect(page.getByText('No messages yet')).toBeVisible({ timeout: 10_000 });
  134 |
  135 |     const messageText = `ack-${Date.now()}`;
  136 |     await page.getByLabel('Message').fill(messageText);
  137 |     await page.getByRole('button', { name: /send/i }).click();
  138 |
  139 |     await expect(page.getByText(messageText)).toBeVisible({ timeout: 5_000 });
  140 |     const tempId = page.locator('[id^="temp-"]');
  141 |     await expect(tempId).toHaveCount(0, { timeout: 5_000 });
  142 |   });
  143 |
  144 |   test('non-active channel preview updates', async ({ page, browser, seedUser }) => {
  145 |     const cookie = `access_token=${signAccessToken(seedUser.id, seedUser.email)}`;
  146 |     const { user: user2, token: token2 } = await createSecondUser(seedUser.workspaceId, 'preview');
  147 |     const { ctx: ctx2, page: page2 } = await setupUserPage(browser, token2);
  148 |
  149 |     const ch1 = await createChannel(seedUser.workspaceId, 'preview-ch1');
  150 |     const ch2 = await createChannel(seedUser.workspaceId, 'preview-ch2');
  151 |
  152 |     await addCookieToContext(page.context(), cookie);
  153 |     await navigateToChat(page, seedUser.workspaceId);
  154 |     await page.getByText(`# ${ch1.name}`).click();
  155 |     await expect(page.getByText(`# ${ch1.name}`)).toBeVisible({ timeout: 10_000 });
  156 |
  157 |     const apiBase = process.env.API_BASE_URL ?? 'http://localhost:3000';
  158 |     const messageText = `preview-msg-${Date.now()}`;
  159 |     const createRes = await fetch(
  160 |       `${apiBase}/api/workspaces/${seedUser.workspaceId}/channels/${ch2.id}/messages`,
  161 |       {
  162 |         method: 'POST',
  163 |         headers: { 'content-type': 'application/json', cookie: `access_token=${token2}` },
  164 |         body: JSON.stringify({
  165 |           content: messageText,
  166 |           mentionedUserIds: [],
  167 |           clientMessageId: `preview-${Date.now()}`,
  168 |         }),
  169 |       },
  170 |     );
```
