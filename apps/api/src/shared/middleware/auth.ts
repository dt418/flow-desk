import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import type { UserRole } from '@flowdesk/db';
import { verifyAccessToken, signAccessToken } from '../lib/jwt';
import { UnauthorizedError } from '../errors';
import { getCachedUser, getCachedMembership } from '../lib/auth-cache';
import type { AccessTokenPayload } from '../lib/jwt';

export interface AuthContext {
  user: { id: string; email: string; name: string };
  payload: AccessTokenPayload;
}

declare module 'hono' {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

function extractToken(c: Context): string | null {
  const auth = c.req.header('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) return auth.slice(7);
  const cookie = getCookie(c, 'access_token');
  return cookie ?? null;
}

export function requireAuth() {
  return async (c: Context, next: Next) => {
    const token = extractToken(c);
    if (!token) throw new UnauthorizedError('Missing access token');

    let payload: AccessTokenPayload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw new UnauthorizedError('Invalid or expired token');
    }

    const user = await getCachedUser(payload.userId);
    if (!user || user.deletedAt) throw new UnauthorizedError('User not found');

    c.set('auth', {
      user: { id: user.id, email: user.email, name: user.name },
      payload,
    });
    await next();
  };
}

export function requireWorkspaceRole(roles: UserRole[]) {
  return async (c: Context, next: Next) => {
    const auth = c.get('auth');
    if (!auth) throw new UnauthorizedError();
    const workspaceId = c.req.param('workspaceId') ?? c.req.param('id');
    if (!workspaceId) throw new UnauthorizedError('workspaceId required');

    const member = await getCachedMembership(workspaceId, auth.user.id);
    if (!member) throw new UnauthorizedError('Not a member');
    if (!roles.includes(member.role as UserRole)) throw new UnauthorizedError('Insufficient role');

    c.set('auth', { ...auth, user: { ...auth.user } } as AuthContext);
    (c as Context & { workspaceRole: string }).workspaceRole = member.role as string;
    (c as Context & { workspaceId: string }).workspaceId = workspaceId;
    await next();
  };
}
