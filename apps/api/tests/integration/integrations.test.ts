import { describe, it, expect, beforeEach } from 'vitest';
import { getTestPrisma } from '../setup/integration';
import { cleanDatabase, createUser, getAuthCookie } from '../setup/factories';
import { buildApp } from '../../src/app';

describe('Integrations Slack/GitLab (P4-3)', () => {
  let prisma: ReturnType<typeof getTestPrisma>;
  beforeEach(async () => {
    prisma = getTestPrisma();
    await cleanDatabase(prisma);
  });

  it('status endpoints work; connect returns 501 without env', async () => {
    const user = await createUser(prisma, 'int@test.local', 'User');
    const cookie = await getAuthCookie(prisma, user.id);
    const app = buildApp();

    const slackStatus = await app.request('/api/integrations/slack/status', {
      headers: { Cookie: cookie },
    });
    expect(slackStatus.status).toBe(200);
    const ss = await slackStatus.json();
    expect(ss.provider).toBe('slack');
    expect(ss.configured).toBe(false);

    const gitlabStatus = await app.request('/api/integrations/gitlab/status', {
      headers: { Cookie: cookie },
    });
    expect(gitlabStatus.status).toBe(200);
    expect((await gitlabStatus.json()).provider).toBe('gitlab');

    const connect = await app.request('/api/integrations/slack/connect', {
      headers: { Cookie: cookie },
    });
    expect(connect.status).toBe(501);
    const body = await connect.json();
    expect(body.code).toBe('NOT_CONFIGURED');
  });
});
