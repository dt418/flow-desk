import { Hono } from 'hono';
import type { Context } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { registerSchema, loginSchema, refreshTokenSchema } from '@flow-desk/shared/auth';
import { prisma } from '../../shared/lib/prisma';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../shared/lib/jwt';
import { env } from '../../shared/lib/prisma';
import { logger } from '../../shared/lib/logger';
import { requireAuth } from '../../shared/middleware/auth';
import { rateLimit } from '../../shared/middleware/rate-limit';
import { ConflictError, UnauthorizedError } from '../../shared/errors';

export const authRouter = new Hono();

function setAuthCookies(c: Context, access: string, refresh: string) {
  setCookie(c, 'access_token', access, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 15 * 60,
  });
  setCookie(c, 'refresh_token', refresh, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });
}

function clearAuthCookies(c: Context) {
  deleteCookie(c, 'access_token', { path: '/' });
  deleteCookie(c, 'refresh_token', { path: '/' });
}

authRouter.post(
  '/register',
  rateLimit({ scope: 'auth:register', windowSec: 3600, max: 3, keyBy: 'ip' }),
  async (c) => {
    const body = registerSchema.parse(await c.req.json());
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw new ConflictError('Email already registered');

    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await prisma.user.create({
      data: { email: body.email, name: body.name, passwordHash },
    });

    await prisma.workspace.create({
      data: {
        name: `${body.name}'s workspace`,
        slug: `ws-${user.id.slice(-6)}`,
        ownerId: user.id,
        members: { create: { userId: user.id, role: 'OWNER' } },
      },
    });

    const access = signAccessToken({ userId: user.id, email: user.email });
    const refresh = signRefreshToken({ userId: user.id, tokenId: crypto.randomUUID() });
    await prisma.refreshToken.create({
      data: {
        id: refresh,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    setAuthCookies(c, access, refresh);

    return c.json(
      { user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl } },
      201,
    );
  },
);

authRouter.post(
  '/login',
  rateLimit({ scope: 'auth:login', windowSec: 60, max: 5, keyBy: 'ip' }),
  async (c) => {
    const body = loginSchema.parse(await c.req.json());
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !user.passwordHash) throw new UnauthorizedError('Invalid credentials');

    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) throw new UnauthorizedError('Invalid credentials');

    const access = signAccessToken({ userId: user.id, email: user.email });
    const refresh = signRefreshToken({ userId: user.id, tokenId: crypto.randomUUID() });
    await prisma.refreshToken.create({
      data: {
        id: refresh,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    setAuthCookies(c, access, refresh);

    return c.json({
      user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl },
    });
  },
);

authRouter.post(
  '/refresh',
  rateLimit({ scope: 'auth:refresh', windowSec: 60, max: 30, keyBy: 'ip' }),
  async (c) => {
    const cookieToken = c.req.header('cookie')?.match(/refresh_token=([^;]+)/)?.[1];
    const body = refreshTokenSchema.safeParse(await c.req.json().catch(() => null));
    const token = body.success ? body.data.refreshToken : cookieToken;
    if (!token) throw new UnauthorizedError('Missing refresh token');

    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      throw new UnauthorizedError('Invalid refresh token');
    }

    const stored = await prisma.refreshToken.findUnique({ where: { id: payload.tokenId } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedError('Refresh token revoked or expired');
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) throw new UnauthorizedError('User not found');

    await prisma.refreshToken.update({
      where: { id: payload.tokenId },
      data: { revokedAt: new Date() },
    });

    const access = signAccessToken({ userId: user.id, email: user.email });
    const newRefresh = signRefreshToken({ userId: user.id, tokenId: crypto.randomUUID() });
    await prisma.refreshToken.create({
      data: {
        id: newRefresh,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    setAuthCookies(c, access, newRefresh);

    return c.json({ ok: true });
  },
);

authRouter.post('/logout', requireAuth(), async (c) => {
  const cookieToken = c.req.header('cookie')?.match(/refresh_token=([^;]+)/)?.[1];
  if (cookieToken) {
    try {
      const payload = verifyRefreshToken(cookieToken);
      await prisma.refreshToken.updateMany({
        where: { id: payload.tokenId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {
      // ignore — clear cookie anyway
    }
  }
  clearAuthCookies(c);
  return c.json({ ok: true });
});

authRouter.get('/me', requireAuth(), async (c) => {
  const auth = c.get('auth');
  const user = await prisma.user.findUnique({
    where: { id: auth.user.id },
    select: { id: true, email: true, name: true, avatarUrl: true },
  });
  if (!user) throw new UnauthorizedError('User not found');
  return c.json({ user });
});

authRouter.get('/google', (c) => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_REDIRECT_URI) {
    return c.json({ message: 'Google OAuth not configured' }, 501);
  }
  const state = crypto.randomUUID();
  setCookie(c, 'oauth_state', state, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 600 });
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', env.GOOGLE_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  return c.redirect(url.toString());
});

const oauthCallbackSchema = z.object({ code: z.string(), state: z.string() });

authRouter.get('/google/callback', async (c) => {
  const { code, state } = oauthCallbackSchema.parse(c.req.query());
  const cookieState = c.req.header('cookie')?.match(/oauth_state=([^;]+)/)?.[1];
  if (!cookieState || cookieState !== state) {
    throw new UnauthorizedError('Invalid OAuth state');
  }

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
    throw new UnauthorizedError('Google OAuth not configured');
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) {
    logger.error({ status: tokenRes.status }, 'Google token exchange failed');
    throw new UnauthorizedError('Google token exchange failed');
  }
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!profileRes.ok) throw new UnauthorizedError('Failed to fetch Google profile');
  const profile = (await profileRes.json()) as { email: string; name: string; picture?: string };

  let user = await prisma.user.findUnique({ where: { email: profile.email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: profile.email,
        name: profile.name ?? profile.email,
        avatarUrl: profile.picture ?? null,
      },
    });
    await prisma.workspace.create({
      data: {
        name: `${user.name}'s workspace`,
        slug: `ws-${user.id.slice(-6)}`,
        ownerId: user.id,
        members: { create: { userId: user.id, role: 'OWNER' } },
      },
    });
  }

  const access = signAccessToken({ userId: user.id, email: user.email });
  const refresh = signRefreshToken({ userId: user.id, tokenId: crypto.randomUUID() });
  await prisma.refreshToken.create({
    data: {
      id: refresh,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  setAuthCookies(c, access, refresh);

  return c.redirect(`${env.CORS_ORIGINS[0]}/`);
});
