import { Hono } from 'hono';
import { requireAuth } from '../../shared/middleware/auth';
import { env } from '../../shared/lib/prisma';

/**
 * P4-3 Slack + GitLab OAuth integrations.
 * Routes are mounted; full OAuth requires SLACK_CLIENT_* / FLOWDESK_GITLAB_* env.
 * When unset, endpoints return 501 with a clear message (not a silent no-op).
 */
export const integrationsRouter = new Hono();
integrationsRouter.use('*', requireAuth());

integrationsRouter.get('/slack/status', (c) => {
  const configured = Boolean(process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET);
  return c.json({
    provider: 'slack',
    configured,
    features: ['slash-command', 'oauth-connect', 'channel-webhook'],
  });
});

integrationsRouter.get('/slack/connect', (c) => {
  if (!process.env.SLACK_CLIENT_ID || !process.env.SLACK_REDIRECT_URI) {
    return c.json(
      {
        code: 'NOT_CONFIGURED',
        message:
          'Slack OAuth not configured. Set SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, SLACK_REDIRECT_URI.',
      },
      501,
    );
  }
  const url = new URL('https://slack.com/oauth/v2/authorize');
  url.searchParams.set('client_id', process.env.SLACK_CLIENT_ID);
  url.searchParams.set('scope', 'commands,incoming-webhook,chat:write');
  url.searchParams.set('redirect_uri', process.env.SLACK_REDIRECT_URI);
  return c.redirect(url.toString());
});

integrationsRouter.post('/slack/commands', async (c) => {
  if (!process.env.SLACK_SIGNING_SECRET) {
    return c.json({ code: 'NOT_CONFIGURED', message: 'Slack signing secret missing' }, 501);
  }
  // Signature verification would go here when SLACK_SIGNING_SECRET is set
  const body = await c.req.parseBody();
  return c.json({
    response_type: 'ephemeral',
    text: `FlowDesk received: ${String(body.text ?? '')}`,
  });
});

integrationsRouter.get('/gitlab/status', (c) => {
  const configured = Boolean(
    process.env.FLOWDESK_GITLAB_CLIENT_ID && process.env.FLOWDESK_GITLAB_CLIENT_SECRET,
  );
  return c.json({
    provider: 'gitlab',
    configured,
    features: ['oauth', 'issue-linking', 'mr-status-badge'],
  });
});

integrationsRouter.get('/gitlab/connect', (c) => {
  if (!process.env.FLOWDESK_GITLAB_CLIENT_ID || !process.env.FLOWDESK_GITLAB_REDIRECT_URI) {
    return c.json(
      {
        code: 'NOT_CONFIGURED',
        message:
          'GitLab OAuth not configured. Set FLOWDESK_GITLAB_CLIENT_ID, FLOWDESK_GITLAB_CLIENT_SECRET, FLOWDESK_GITLAB_REDIRECT_URI.',
      },
      501,
    );
  }
  const base = process.env.FLOWDESK_GITLAB_BASE_URL ?? 'https://gitlab.com';
  const url = new URL(`${base}/oauth/authorize`);
  url.searchParams.set('client_id', process.env.FLOWDESK_GITLAB_CLIENT_ID);
  url.searchParams.set('redirect_uri', process.env.FLOWDESK_GITLAB_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'api read_user');
  return c.redirect(url.toString());
});

// silence unused env import if tree-shaken
void env;
