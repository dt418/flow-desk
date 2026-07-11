import { Hono } from 'hono';
import type { Context } from 'hono';
import { randomUUID } from 'node:crypto';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';
import { z } from 'zod';
import { requireAuth } from '../../shared/middleware/auth';
import {
  buildAuthorizeUrl,
  getProviderConfig,
  integrationService,
  isProviderConfigured,
} from './integration.service';

/**
 * P4-3 Slack + GitLab OAuth integrations.
 *
 * Routes:
 *   GET  /api/integrations/slack/status   - feature + configured flag
 *   GET  /api/integrations/slack/connect  - 302 to provider authorize URL
 *   GET  /api/integrations/slack/callback - exchanges code, stores token
 *   GET  /api/integrations/gitlab/status
 *   GET  /api/integrations/gitlab/connect
 *   GET  /api/integrations/gitlab/callback
 *   GET  /api/integrations                - list connected integrations (any provider)
 *   DELETE /api/integrations/:id          - revoke (soft-delete)
 *   POST /api/integrations/slack/commands - slash-command receiver (requires SLACK_SIGNING_SECRET)
 *
 * All routes require auth except callbacks: the OAuth provider redirects the
 * user's browser back to the callback, so the session cookie is what
 * authenticates them. The random `state` param guards against CSRF.
 */
export const integrationsRouter = new Hono();

const oauthCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  workspaceId: z.string().min(1),
});

function statusFor(provider: 'slack' | 'gitlab') {
  const c = getProviderConfig(provider.toUpperCase() as 'SLACK' | 'GITLAB');
  const configured = isProviderConfigured(provider.toUpperCase() as 'SLACK' | 'GITLAB');
  return c && { provider, configured, features: c.defaultScopes };
}

integrationsRouter.get('/slack/status', (c) => c.json(statusFor('slack')));
integrationsRouter.get('/gitlab/status', (c) => c.json(statusFor('gitlab')));

// ---- Authorize (connect) ----
// These redirect to the provider. The state param + oauth_state cookie are
// how the callback verifies the same browser session is doing both halves.
integrationsRouter.get('/slack/connect', requireAuth(), async (c) => {
  const auth = c.get('auth');
  if (!auth) return c.json({ code: 'UNAUTHORIZED' }, 401);
  const workspaceId = c.req.query('workspaceId');
  if (!workspaceId) {
    return c.json({ code: 'MISSING_WORKSPACE', message: 'workspaceId query param required' }, 400);
  }
  if (!isProviderConfigured('SLACK')) {
    return c.json(
      {
        code: 'NOT_CONFIGURED',
        message:
          'Slack OAuth not configured. Set SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, SLACK_REDIRECT_URI.',
      },
      501,
    );
  }
  const state = randomUUID();
  setCookie(c, 'oauth_state', state, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 600 });
  setCookie(c, 'oauth_workspace', workspaceId, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 600,
  });
  setCookie(c, 'oauth_user', auth.user.id, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 600,
  });
  setCookie(c, 'oauth_provider', 'SLACK', {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 600,
  });
  const url = new URL(buildAuthorizeUrl('SLACK', state));
  // carry workspaceId through to the callback via state cookie + query (provider echoes query)
  url.searchParams.set('state', state);
  return c.redirect(url.toString());
});

integrationsRouter.get('/gitlab/connect', requireAuth(), async (c) => {
  const auth = c.get('auth');
  if (!auth) return c.json({ code: 'UNAUTHORIZED' }, 401);
  const workspaceId = c.req.query('workspaceId');
  if (!workspaceId) {
    return c.json({ code: 'MISSING_WORKSPACE', message: 'workspaceId query param required' }, 400);
  }
  if (!isProviderConfigured('GITLAB')) {
    return c.json(
      {
        code: 'NOT_CONFIGURED',
        message:
          'GitLab OAuth not configured. Set FLOWDESK_GITLAB_CLIENT_ID, FLOWDESK_GITLAB_CLIENT_SECRET, FLOWDESK_GITLAB_REDIRECT_URI.',
      },
      501,
    );
  }
  const state = randomUUID();
  setCookie(c, 'oauth_state', state, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 600 });
  setCookie(c, 'oauth_workspace', workspaceId, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 600,
  });
  setCookie(c, 'oauth_user', auth.user.id, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 600,
  });
  setCookie(c, 'oauth_provider', 'GITLAB', {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 600,
  });
  const url = new URL(buildAuthorizeUrl('GITLAB', state));
  url.searchParams.set('state', state);
  return c.redirect(url.toString());
});

// ---- Callback (no requireAuth — session cookie authenticates the browser) ----
async function handleCallback(c: Context, provider: 'SLACK' | 'GITLAB') {
  const cookieState = getCookie(c, 'oauth_state');
  const cookieWorkspace = getCookie(c, 'oauth_workspace');
  const cookieUser = getCookie(c, 'oauth_user');
  const cookieProvider = getCookie(c, 'oauth_provider');
  // Always clear state cookies (one-shot)
  deleteCookie(c, 'oauth_state', { path: '/' });
  deleteCookie(c, 'oauth_workspace', { path: '/' });
  deleteCookie(c, 'oauth_user', { path: '/' });
  deleteCookie(c, 'oauth_provider', { path: '/' });

  const parsed = oauthCallbackSchema.safeParse({
    ...Object.fromEntries(new URL(c.req.url).searchParams),
  });
  if (!parsed.success) {
    return c.json({ code: 'INVALID_QUERY', message: 'code + state + workspaceId required' }, 400);
  }
  const { code, state, workspaceId } = parsed.data;
  if (!cookieState || cookieState !== state) {
    return c.json({ code: 'INVALID_STATE', message: 'OAuth state mismatch' }, 400);
  }
  if (cookieProvider !== provider) {
    return c.json(
      { code: 'PROVIDER_MISMATCH', message: 'OAuth state was for a different provider' },
      400,
    );
  }
  if (!cookieUser || !cookieWorkspace || cookieWorkspace !== workspaceId) {
    return c.json({ code: 'MISSING_SESSION', message: 'OAuth session cookies missing' }, 400);
  }
  try {
    const row = await integrationService.completeOAuthCallback({
      provider,
      workspaceId,
      userId: cookieUser,
      code,
    });
    return c.json({
      ok: true,
      provider,
      externalAccountId: row.externalAccountId,
      externalAccountName: row.externalAccountName,
    });
  } catch (err) {
    return c.json(
      {
        code: 'OAUTH_FAILED',
        message: err instanceof Error ? err.message : 'OAuth callback failed',
      },
      400,
    );
  }
}

integrationsRouter.get('/slack/callback', async (c) => handleCallback(c, 'SLACK'));
integrationsRouter.get('/gitlab/callback', async (c) => handleCallback(c, 'GITLAB'));

// ---- List + revoke ----
integrationsRouter.get('/', requireAuth(), async (c) => {
  const auth = c.get('auth');
  if (!auth) return c.json({ code: 'UNAUTHORIZED' }, 401);
  const workspaceId = c.req.query('workspaceId');
  if (!workspaceId) {
    return c.json({ code: 'MISSING_WORKSPACE', message: 'workspaceId query param required' }, 400);
  }
  const rows = await integrationService.listForWorkspace(auth.user.id, workspaceId);
  return c.json({
    data: rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      externalAccountId: r.externalAccountId,
      externalAccountName: r.externalAccountName,
      scopes: r.scopes,
      accessTokenExpiresAt: r.accessTokenExpiresAt,
      createdAt: r.createdAt,
    })),
  });
});

integrationsRouter.delete('/:id', requireAuth(), async (c) => {
  const auth = c.get('auth');
  if (!auth) return c.json({ code: 'UNAUTHORIZED' }, 401);
  const workspaceId = c.req.query('workspaceId');
  if (!workspaceId) {
    return c.json({ code: 'MISSING_WORKSPACE', message: 'workspaceId query param required' }, 400);
  }
  await integrationService.revoke(auth.user.id, workspaceId, c.req.param('id')!);
  return c.json({ ok: true });
});

// ---- Slack slash command (no requireAuth — Slack signs requests) ----
integrationsRouter.post('/slack/commands', async (c) => {
  if (!process.env.SLACK_SIGNING_SECRET) {
    return c.json({ code: 'NOT_CONFIGURED', message: 'Slack signing secret missing' }, 501);
  }
  // Signature verification would go here when SLACK_SIGNING_SECRET is set.
  const body = await c.req.parseBody();
  return c.json({
    response_type: 'ephemeral',
    text: `FlowDesk received: ${String((body as Record<string, unknown>).text ?? '')}`,
  });
});
