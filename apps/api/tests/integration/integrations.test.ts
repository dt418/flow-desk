import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getTestPrisma } from '../setup/integration';
import { cleanDatabase, createUser, createWorkspace, getAuthCookie } from '../setup/factories';
import { buildApp } from '../../src/app';

const ORIGINAL_FETCH = globalThis.fetch;

describe('Integrations Slack/GitLab (P4-3)', () => {
  let prisma: ReturnType<typeof getTestPrisma>;
  beforeEach(async () => {
    prisma = getTestPrisma();
    await cleanDatabase(prisma);
    // Make sure all the env-var gates in the routes are tripped on for the
    // callback tests; status/connect-only tests still work when unset.
    process.env.SLACK_CLIENT_ID = 'slack_test_client';
    process.env.SLACK_CLIENT_SECRET = 'slack_test_secret';
    process.env.SLACK_REDIRECT_URI = 'http://localhost:3000/api/integrations/slack/callback';
    process.env.FLOWDESK_GITLAB_CLIENT_ID = 'gitlab_test_client';
    process.env.FLOWDESK_GITLAB_CLIENT_SECRET = 'gitlab_test_secret';
    process.env.FLOWDESK_GITLAB_REDIRECT_URI =
      'http://localhost:3000/api/integrations/gitlab/callback';
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    delete process.env.SLACK_CLIENT_ID;
    delete process.env.SLACK_CLIENT_SECRET;
    delete process.env.SLACK_REDIRECT_URI;
    delete process.env.FLOWDESK_GITLAB_CLIENT_ID;
    delete process.env.FLOWDESK_GITLAB_CLIENT_SECRET;
    delete process.env.FLOWDESK_GITLAB_REDIRECT_URI;
  });

  it('status reports configured=true once env is set', async () => {
    const user = await createUser(prisma, 'int@test.local', 'User');
    const cookie = await getAuthCookie(prisma, user.id);
    const app = buildApp();

    const slackStatus = await app.request('/api/integrations/slack/status', {
      headers: { Cookie: cookie },
    });
    expect(slackStatus.status).toBe(200);
    const ss = await slackStatus.json();
    expect(ss.configured).toBe(true);

    const gitlabStatus = await app.request('/api/integrations/gitlab/status', {
      headers: { Cookie: cookie },
    });
    expect((await gitlabStatus.json()).configured).toBe(true);
  });

  it('status 501 + connect 501 when env missing', async () => {
    delete process.env.SLACK_CLIENT_ID;
    delete process.env.SLACK_CLIENT_SECRET;
    delete process.env.SLACK_REDIRECT_URI;
    delete process.env.FLOWDESK_GITLAB_CLIENT_ID;
    delete process.env.FLOWDESK_GITLAB_CLIENT_SECRET;
    delete process.env.FLOWDESK_GITLAB_REDIRECT_URI;
    const user = await createUser(prisma, 'int2@test.local', 'User');
    const cookie = await getAuthCookie(prisma, user.id);
    const app = buildApp();

    const slackStatus = await app.request('/api/integrations/slack/status', {
      headers: { Cookie: cookie },
    });
    expect((await slackStatus.json()).configured).toBe(false);

    const slackConnect = await app.request('/api/integrations/slack/connect?workspaceId=anything', {
      headers: { Cookie: cookie },
    });
    expect(slackConnect.status).toBe(501);

    const gitlabConnect = await app.request(
      '/api/integrations/gitlab/connect?workspaceId=anything',
      { headers: { Cookie: cookie } },
    );
    expect(gitlabConnect.status).toBe(501);
  });

  it('slack/connect 302s to authorize URL with state', async () => {
    const owner = await createUser(prisma, 'slack-owner@test.local', 'Owner');
    const ws = await createWorkspace(prisma, owner.id, 'Slack WS');
    const cookie = await getAuthCookie(prisma, owner.id);
    const app = buildApp();

    const res = await app.request(`/api/integrations/slack/connect?workspaceId=${ws.id}`, {
      headers: { Cookie: cookie },
      redirect: 'manual',
    });
    expect(res.status).toBe(302);
    const loc = res.headers.get('location') ?? '';
    expect(loc).toContain('slack.com/oauth/v2/authorize');
    expect(loc).toContain('client_id=slack_test_client');
    expect(loc).toContain('state=');
    // state cookie set + workspaceId cookie set
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('oauth_state=');
    expect(setCookie).toContain(`oauth_workspace=${ws.id}`);
    expect(setCookie).toContain('oauth_provider=SLACK');
  });

  it('slack callback completes OAuth + stores encrypted token + lists + revokes', async () => {
    const owner = await createUser(prisma, 'slack-cb@test.local', 'Owner');
    const ws = await createWorkspace(prisma, owner.id, 'Slack CB WS');
    const cookie = await getAuthCookie(prisma, owner.id);
    const app = buildApp();

    // 1) connect — capture state from the redirect URL
    const connectRes = await app.request(`/api/integrations/slack/connect?workspaceId=${ws.id}`, {
      headers: { Cookie: cookie },
      redirect: 'manual',
    });
    const state = new URL(connectRes.headers.get('location') ?? '').searchParams.get('state')!;

    // 2) mock the OAuth token endpoint + slack auth.test
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url.startsWith('https://slack.com/api/oauth.v2.access')) {
        return new Response(
          JSON.stringify({
            ok: true,
            access_token: 'SLACK_TEST_ACCESS_TOKEN_VALUE',
            scope: 'commands,incoming-webhook,chat:write',
            team: { id: 'T12345', name: 'Acme Corp' },
            bot_user_id: 'U99999',
            expires_in: 3600,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.startsWith('https://slack.com/api/auth.test')) {
        return new Response(JSON.stringify({ ok: true, team_id: 'T12345', team: 'Acme Corp' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch in test: ${url}`);
    }) as unknown as typeof fetch;

    // 3) callback with the right state + workspaceId — forward the oauth cookies
    const cookieHeader = connectRes.headers.get('set-cookie') ?? '';
    const stateCookie = cookieHeader.split(',').find((c) => c.includes('oauth_state='))!;
    const workspaceCookie = cookieHeader.split(',').find((c) => c.includes('oauth_workspace='))!;
    const userCookie = cookieHeader.split(',').find((c) => c.includes('oauth_user='))!;
    const providerCookie = cookieHeader.split(',').find((c) => c.includes('oauth_provider='))!;
    const callbackRes = await app.request(
      `/api/integrations/slack/callback?code=abc&state=${state}`,
      {
        headers: {
          Cookie: [stateCookie, workspaceCookie, userCookie, providerCookie]
            .map((c) => c.split(';')[0]!)
            .join('; '),
        },
      },
    );
    expect(callbackRes.status).toBe(200);
    const cbBody = await callbackRes.json();
    expect(cbBody.ok).toBe(true);
    expect(cbBody.externalAccountId).toBe('T12345');
    expect(cbBody.externalAccountName).toBe('Acme Corp');

    // 4) verify Integration row exists with encrypted token (not plaintext)
    const rows = await prisma.integration.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.provider).toBe('SLACK');
    expect(rows[0]!.accessTokenCipher).not.toContain('SLACK_TEST_ACCESS_TOKEN_VALUE');

    // 5) list endpoint returns the row
    const listRes = await app.request(`/api/integrations?workspaceId=${ws.id}`, {
      headers: { Cookie: cookie },
    });
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()).data;
    expect(list).toHaveLength(1);
    expect(list[0].provider).toBe('SLACK');
    expect(list[0].externalAccountId).toBe('T12345');

    // 6) revoke soft-deletes
    const delRes = await app.request(`/api/integrations/${rows[0]!.id}?workspaceId=${ws.id}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
    expect(delRes.status).toBe(200);

    const after = await prisma.integration.findMany();
    // softDelete row still exists with deletedAt set
    const live = after.filter((r) => !r.deletedAt);
    expect(live).toHaveLength(0);
  });

  it('gitlab callback completes OAuth + stores encrypted refresh token', async () => {
    const owner = await createUser(prisma, 'gl-cb@test.local', 'Owner');
    const ws = await createWorkspace(prisma, owner.id, 'GL WS');
    const cookie = await getAuthCookie(prisma, owner.id);
    const app = buildApp();

    const connectRes = await app.request(`/api/integrations/gitlab/connect?workspaceId=${ws.id}`, {
      headers: { Cookie: cookie },
      redirect: 'manual',
    });
    const state = new URL(connectRes.headers.get('location') ?? '').searchParams.get('state')!;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url.startsWith('https://gitlab.com/oauth/token')) {
        return new Response(
          JSON.stringify({
            access_token: 'glpat-fake-access',
            refresh_token: 'glpat-fake-refresh',
            token_type: 'Bearer',
            scope: 'api read_user',
            expires_in: 7200,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.startsWith('https://gitlab.com/api/v4/user')) {
        return new Response(JSON.stringify({ id: 42, username: 'alice' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch in test: ${url}`);
    }) as unknown as typeof fetch;

    const cookieHeader = connectRes.headers.get('set-cookie') ?? '';
    const cookieObj = (name: string) =>
      cookieHeader
        .split(',')
        .find((c) => c.includes(`${name}=`))!
        .split(';')[0]!;
    const callbackRes = await app.request(
      `/api/integrations/gitlab/callback?code=gl-code&state=${state}`,
      {
        headers: {
          Cookie: [
            cookieObj('oauth_state'),
            cookieObj('oauth_workspace'),
            cookieObj('oauth_user'),
            cookieObj('oauth_provider'),
          ].join('; '),
        },
      },
    );
    expect(callbackRes.status).toBe(200);
    const body = await callbackRes.json();
    expect(body.ok).toBe(true);
    expect(body.externalAccountId).toBe('42');
    expect(body.externalAccountName).toBe('alice');

    const row = await prisma.integration.findFirst();
    expect(row).not.toBeNull();
    expect(row!.provider).toBe('GITLAB');
    expect(row!.accessTokenCipher).not.toContain('glpat-fake-access');
    expect(row!.refreshTokenCipher).not.toContain('glpat-fake-refresh');
    expect(row!.refreshTokenCipher).not.toBeNull();
  });

  it('callback rejects mismatched state', async () => {
    const owner = await createUser(prisma, 'cb-bad@test.local', 'Owner');
    const ws = await createWorkspace(prisma, owner.id, 'Bad CB WS');
    const cookie = await getAuthCookie(prisma, owner.id);
    const app = buildApp();

    const connectRes = await app.request(`/api/integrations/slack/connect?workspaceId=${ws.id}`, {
      headers: { Cookie: cookie },
      redirect: 'manual',
    });
    const cookieHeader = connectRes.headers.get('set-cookie') ?? '';
    const cookieObj = (name: string) =>
      cookieHeader
        .split(',')
        .find((c) => c.includes(`${name}=`))!
        .split(';')[0]!;

    const callbackRes = await app.request(`/api/integrations/slack/callback?code=abc&state=WRONG`, {
      headers: {
        Cookie: [
          cookieObj('oauth_state'),
          cookieObj('oauth_workspace'),
          cookieObj('oauth_user'),
          cookieObj('oauth_provider'),
        ].join('; '),
      },
    });
    expect(callbackRes.status).toBe(400);
    const body = await callbackRes.json();
    expect(body.code).toBe('INVALID_STATE');
    // nothing stored
    expect(await prisma.integration.count()).toBe(0);
  });
});
