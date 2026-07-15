import { BadRequestError, NotFoundError } from '../../shared/errors';
import { assertMembership } from '../../shared/lib/access';
import { logger } from '../../shared/lib/logger';
import { env } from '../../shared/lib/env';
import { integrationRepository } from './integration.repository';
import { decryptToken, encryptToken } from './integration-crypto';
import type { IntegrationProvider } from '@flowdesk/db';

/**
 * Provider OAuth configuration. The connect URL is built from this and the
 * per-call `state`/`code`; the token exchange hits the provider's token
 * endpoint with the same client credentials.
 *
 * The endpoints listed here are the public, documented OAuth endpoints for
 * each provider. SLACK_* / FLOWDESK_GITLAB_* env vars gate whether the route
 * returns 501 (NOT_CONFIGURED) or proceeds.
 */
const PROVIDER_CONFIG: Record<
  IntegrationProvider,
  {
    authorizeUrl: string;
    tokenUrl: string;
    defaultScopes: string[];
    envClientId: string;
    envClientSecret: string;
    envRedirectUri: string;
  }
> = {
  SLACK: {
    authorizeUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    defaultScopes: 'commands,incoming-webhook,chat:write'.split(','),
    envClientId: 'SLACK_CLIENT_ID',
    envClientSecret: 'SLACK_CLIENT_SECRET',
    envRedirectUri: 'SLACK_REDIRECT_URI',
  },
  GITLAB: {
    authorizeUrl: 'https://gitlab.com/oauth/authorize',
    tokenUrl: 'https://gitlab.com/oauth/token',
    defaultScopes: 'api,read_user'.split(','),
    envClientId: 'FLOWDESK_GITLAB_CLIENT_ID',
    envClientSecret: 'FLOWDESK_GITLAB_CLIENT_SECRET',
    envRedirectUri: 'FLOWDESK_GITLAB_REDIRECT_URI',
  },
};

export function getProviderConfig(p: IntegrationProvider) {
  return PROVIDER_CONFIG[p];
}

export function isProviderConfigured(p: IntegrationProvider): boolean {
  const c = PROVIDER_CONFIG[p];
  return Boolean(
    process.env[c.envClientId] && process.env[c.envClientSecret] && process.env[c.envRedirectUri],
  );
}

export function buildAuthorizeUrl(p: IntegrationProvider, state: string): string {
  const c = PROVIDER_CONFIG[p];
  const clientId = process.env[c.envClientId]!;
  const redirectUri = process.env[c.envRedirectUri]!;
  const url = new URL(c.authorizeUrl);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  if (p === 'SLACK') {
    url.searchParams.set('scope', c.defaultScopes.join(','));
  } else {
    // gitlab: response_type=code, scope=api read_user
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', c.defaultScopes.join(' '));
  }
  return url.toString();
}

type SlackTokenResponse = {
  ok: boolean;
  error?: string;
  access_token?: string;
  scope?: string;
  team?: { id: string; name: string };
  authed_user?: { id: string };
  bot_user_id?: string;
  expires_in?: number;
};

type GitlabTokenResponse = {
  access_token: string;
  token_type: string;
  scope?: string;
  refresh_token?: string;
  expires_in?: number;
  created_at?: number;
};

type GitlabUserResponse = {
  id: number;
  username: string;
};

async function exchangeCode(
  p: IntegrationProvider,
  code: string,
): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  scopes: string[];
}> {
  const c = PROVIDER_CONFIG[p];
  const clientId = process.env[c.envClientId]!;
  const clientSecret = process.env[c.envClientSecret]!;
  const redirectUri = process.env[c.envRedirectUri]!;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });
  if (p === 'SLACK') {
    // slack expects form-encoded too; not a JSON endpoint
  } else {
    body.set('grant_type', 'authorization_code');
  }

  const res = await fetch(c.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new BadRequestError(`${p} token exchange failed: ${res.status} ${text.slice(0, 200)}`);
  }
  if (p === 'SLACK') {
    const j = (await res.json()) as SlackTokenResponse;
    if (!j.ok || !j.access_token || !j.team) {
      throw new BadRequestError(`Slack token exchange failed: ${j.error ?? 'unknown'}`);
    }
    return {
      accessToken: j.access_token,
      refreshToken: null,
      expiresAt: j.expires_in ? Math.floor(Date.now() / 1000) + j.expires_in : null,
      scopes: (j.scope ?? c.defaultScopes.join(',')).split(',').filter(Boolean),
    };
  }
  // gitlab
  const j = (await res.json()) as GitlabTokenResponse;
  if (!j.access_token) {
    throw new BadRequestError('GitLab token exchange failed: missing access_token');
  }
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token ?? null,
    expiresAt: j.expires_in ? Math.floor(Date.now() / 1000) + j.expires_in : null,
    scopes: (j.scope ?? c.defaultScopes.join(' ')).split(/[\s,]+/).filter(Boolean),
  };
}

async function resolveGitlabUser(accessToken: string): Promise<{ id: string; name: string }> {
  const base = env.FLOWDESK_GITLAB_BASE_URL;
  const res = await fetch(`${base}/api/v4/user`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new BadRequestError(`GitLab /user lookup failed: ${res.status}`);
  }
  const j = (await res.json()) as GitlabUserResponse;
  return { id: String(j.id), name: j.username };
}

async function resolveSlackTeam(
  accessToken: string,
  teamIdHint?: string,
): Promise<{ id: string; name: string }> {
  // Slack's oauth.v2 response already included team — for completeness we
  // could call auth.test but the team.id from the token exchange is enough.
  // The hint path is for the rare case of re-connecting with a different team.
  if (teamIdHint) return { id: teamIdHint, name: '' };
  return { id: 'unknown', name: 'unknown' };
}

export const integrationService = {
  /**
   * Exchange the OAuth code and persist the resulting token. Idempotent on
   * (provider, workspace, externalAccount): a second connect for the same
   * account updates the token row instead of creating a duplicate.
   */
  async completeOAuthCallback(args: {
    provider: IntegrationProvider;
    workspaceId: string;
    userId: string;
    code: string;
  }) {
    if (!isProviderConfigured(args.provider)) {
      throw new BadRequestError(`${args.provider} OAuth not configured`);
    }
    await assertMembership(args.workspaceId, args.userId);
    const tokens = await exchangeCode(args.provider, args.code);

    let externalAccount: { id: string; name: string };
    if (args.provider === 'GITLAB') {
      externalAccount = await resolveGitlabUser(tokens.accessToken);
    } else {
      // Slack: re-call auth.test so we always have fresh team info
      const test = await fetch('https://slack.com/api/auth.test', {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      if (test.ok) {
        const t = (await test.json()) as { ok: boolean; team_id?: string; team?: string };
        externalAccount = { id: t.team_id ?? 'unknown', name: t.team ?? 'unknown' };
      } else {
        externalAccount = await resolveSlackTeam(tokens.accessToken);
      }
    }

    const accessTokenCipher = encryptToken(tokens.accessToken);
    const refreshTokenCipher = tokens.refreshToken ? encryptToken(tokens.refreshToken) : null;

    const existing = await integrationRepository.findByProviderAccount(
      args.provider,
      args.workspaceId,
      externalAccount.id,
    );

    if (existing) {
      const updated = await integrationRepository.updateTokens(existing.id, {
        accessTokenCipher,
        refreshTokenCipher,
        accessTokenExpiresAt: tokens.expiresAt,
        scopes: tokens.scopes,
      });
      return updated;
    }

    return integrationRepository.create({
      provider: args.provider,
      workspaceId: args.workspaceId,
      userId: args.userId,
      externalAccountId: externalAccount.id,
      externalAccountName: externalAccount.name,
      scopes: tokens.scopes,
      accessTokenCipher,
      refreshTokenCipher,
      accessTokenExpiresAt: tokens.expiresAt,
    });
  },

  /**
   * Used by integration-aware code paths (e.g. automation actions) to
   * load a decrypted access token. Returns null if revoked or missing.
   */
  async getAccessToken(
    provider: IntegrationProvider,
    workspaceId: string,
    externalAccountId: string,
  ): Promise<string | null> {
    const row = await integrationRepository.findByProviderAccount(
      provider,
      workspaceId,
      externalAccountId,
    );
    if (!row) return null;
    return decryptToken(row.accessTokenCipher);
  },

  async listForWorkspace(userId: string, workspaceId: string) {
    await assertMembership(workspaceId, userId);
    return integrationRepository.listByWorkspace(workspaceId);
  },

  async revoke(userId: string, workspaceId: string, integrationId: string) {
    await assertMembership(workspaceId, userId);
    const row = await integrationRepository.listByWorkspace(workspaceId);
    const target = row.find((r) => r.id === integrationId);
    if (!target) throw new NotFoundError('Integration not found');
    await integrationRepository.softDelete(integrationId);
    logger.info({ integrationId, provider: target.provider, workspaceId }, 'integration revoked');
  },
};
