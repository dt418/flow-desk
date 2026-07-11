import { Hono } from 'hono';
import type { Context } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import QRCode from 'qrcode';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  login2faSchema,
  verify2faSetupSchema,
  disable2faSchema,
} from '@flow-desk/shared/auth';
import { prisma } from '../../shared/lib/prisma';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  signSocketToken,
  signTwoFactorChallenge,
  verifyTwoFactorChallenge,
} from '../../shared/lib/jwt';
import jwt from 'jsonwebtoken';
import { env } from '../../shared/lib/prisma';
import { logger } from '../../shared/lib/logger';
import { requireAuth } from '../../shared/middleware/auth';
import { rateLimit } from '../../shared/middleware/rate-limit';
import { BadRequestError, ConflictError, UnauthorizedError } from '../../shared/errors';
import {
  encryptTotpSecret,
  decryptTotpSecret,
  generateBackupCodes,
  consumeBackupCode,
} from './totp';
import { generateTotpSecret, totpKeyUri, verifyTotpToken } from './totp-engine';

export const authRouter = new Hono();

/**
 * Validate CORS_ORIGINS[0] as a safe post-login redirect target.
 * Blocks open-redirect via malformed env or missing config.
 */
function postLoginRedirect(c: Context): Response {
  const origins = env.CORS_ORIGINS;
  if (!origins || origins.length === 0 || !origins[0]) {
    logger.error({ event: 'oauth.postlogin.no_cors_origins' }, 'CORS_ORIGINS empty');
    throw new Error('CORS_ORIGINS not configured');
  }
  const target = origins[0];
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    throw new Error(`CORS_ORIGINS[0] not a URL: ${target}`);
  }
  if (!/^https?:$/.test(url.protocol)) {
    throw new Error(`CORS_ORIGINS[0] bad protocol: ${url.protocol}`);
  }
  return c.redirect(`${url.origin}/`);
}

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
    // findFirst with deletedAt:not:null catches soft-deleted accounts that findUnique would miss.
    // Return 409 regardless so attackers cannot probe for soft-deleted emails.
    const existing = await prisma.user.findFirst({
      where: { email: body.email, deletedAt: { not: null } },
    });
    if (existing) throw new ConflictError('Email already registered');

    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { email: body.email, name: body.name, passwordHash },
      });

      await tx.workspace.create({
        data: {
          name: `${body.name}'s workspace`,
          slug: `ws-${u.id.slice(-6)}`,
          ownerId: u.id,
          members: { create: { userId: u.id, role: 'OWNER' } },
        },
      });

      const access = signAccessToken({ userId: u.id, email: u.email });
      const tokenId = crypto.randomUUID();
      const refresh = signRefreshToken({ userId: u.id, tokenId });
      await tx.refreshToken.create({
        data: {
          id: tokenId,
          userId: u.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      setAuthCookies(c, access, refresh);

      return u;
    });

    return c.json(
      { user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl } },
      201,
    );
  },
);

async function issueSession(
  c: Context,
  user: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    twoFactorEnabled?: boolean;
  },
) {
  const access = signAccessToken({ userId: user.id, email: user.email });
  const tokenId = crypto.randomUUID();
  const refresh = signRefreshToken({ userId: user.id, tokenId });
  await prisma.refreshToken.create({
    data: {
      id: tokenId,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  setAuthCookies(c, access, refresh);
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      twoFactorEnabled: user.twoFactorEnabled ?? false,
    },
  };
}

authRouter.post(
  '/login',
  rateLimit({ scope: 'auth:login', windowSec: 60, max: 5, keyBy: 'ip' }),
  async (c) => {
    const body = loginSchema.parse(await c.req.json());
    const user = await prisma.user.findFirst({ where: { email: body.email, deletedAt: null } });
    if (!user || !user.passwordHash) throw new UnauthorizedError('Invalid credentials');

    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) throw new UnauthorizedError('Invalid credentials');

    if (user.twoFactorEnabled) {
      const challengeToken = signTwoFactorChallenge({ userId: user.id, email: user.email });
      return c.json({ twoFactorRequired: true as const, challengeToken });
    }

    return c.json(await issueSession(c, user));
  },
);

authRouter.post(
  '/login/2fa',
  rateLimit({ scope: 'auth:login-2fa', windowSec: 60, max: 10, keyBy: 'ip' }),
  async (c) => {
    const body = login2faSchema.parse(await c.req.json());
    let challenge;
    try {
      challenge = verifyTwoFactorChallenge(body.challengeToken);
    } catch {
      throw new UnauthorizedError('Invalid or expired 2FA challenge');
    }

    const user = await prisma.user.findUnique({ where: { id: challenge.userId } });
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new UnauthorizedError('2FA is not enabled for this account');
    }

    const secret = decryptTotpSecret(user.twoFactorSecret);
    const totpOk = verifyTotpToken(body.code, secret);
    if (totpOk) {
      return c.json(await issueSession(c, user));
    }

    // Try backup codes
    const remaining = await consumeBackupCode(
      body.code.trim().toLowerCase(),
      user.twoFactorBackupCodes,
    );
    if (!remaining) {
      throw new UnauthorizedError('Invalid authentication code');
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorBackupCodes: remaining },
    });
    return c.json(await issueSession(c, user));
  },
);

// --- 2FA setup / disable (authenticated) ---

authRouter.post(
  '/2fa/setup',
  requireAuth(),
  rateLimit({ scope: 'auth:2fa-setup', windowSec: 60, max: 5, keyBy: 'user' }),
  async (c) => {
    const auth = c.get('auth');
    const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
    if (!user) throw new UnauthorizedError('User not found');
    if (user.twoFactorEnabled) throw new BadRequestError('2FA is already enabled');

    const secret = generateTotpSecret();
    const encrypted = encryptTotpSecret(secret);
    // Store pending secret; not enabled until verify
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorSecret: encrypted },
    });

    const otpauthUrl = totpKeyUri(user.email, secret);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
    return c.json({ secret, otpauthUrl, qrDataUrl });
  },
);

authRouter.post(
  '/2fa/verify',
  requireAuth(),
  rateLimit({ scope: 'auth:2fa-verify', windowSec: 60, max: 10, keyBy: 'user' }),
  async (c) => {
    const auth = c.get('auth');
    const body = verify2faSetupSchema.parse(await c.req.json());
    const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
    if (!user?.twoFactorSecret) throw new BadRequestError('Call /2fa/setup first');
    if (user.twoFactorEnabled) throw new BadRequestError('2FA is already enabled');

    const secret = decryptTotpSecret(user.twoFactorSecret);
    if (!verifyTotpToken(body.code, secret)) {
      throw new UnauthorizedError('Invalid TOTP code');
    }

    const { plain, hashes } = await generateBackupCodes(8);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorEnabled: true,
        twoFactorBackupCodes: hashes,
      },
    });

    return c.json({
      enabled: true,
      backupCodes: plain,
    });
  },
);

authRouter.post(
  '/2fa/disable',
  requireAuth(),
  rateLimit({ scope: 'auth:2fa-disable', windowSec: 60, max: 5, keyBy: 'user' }),
  async (c) => {
    const auth = c.get('auth');
    const body = disable2faSchema.parse(await c.req.json());
    const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
    if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestError('2FA is not enabled');
    }

    const secret = decryptTotpSecret(user.twoFactorSecret);
    const totpOk = verifyTotpToken(body.code, secret);
    let backupOk = false;
    if (!totpOk) {
      const remaining = await consumeBackupCode(
        body.code.trim().toLowerCase(),
        user.twoFactorBackupCodes,
      );
      backupOk = remaining !== null;
    }
    if (!totpOk && !backupOk) {
      throw new UnauthorizedError('Invalid authentication code');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackupCodes: [],
      },
    });
    return c.json({ enabled: false });
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
    const newTokenId = crypto.randomUUID();
    const newRefresh = signRefreshToken({ userId: user.id, tokenId: newTokenId });
    await prisma.refreshToken.create({
      data: {
        id: newTokenId,
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
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      twoFactorEnabled: true,
    },
  });
  if (!user) throw new UnauthorizedError('User not found');
  return c.json({ user });
});

// ponytail: JS-readable socket auth token. Short-lived and scope:'socket' so a
// leaked client token can't call REST (which needs the httpOnly access cookie).
// Client stores it in memory and passes it as `auth:{ token }` on the handshake.
authRouter.get(
  '/socket-token',
  rateLimit({ scope: 'auth:socket-token', windowSec: 60, max: 30, keyBy: 'user' }),
  requireAuth(),
  async (c) => {
    const auth = c.get('auth');
    const token = signSocketToken({ userId: auth.user.id, email: auth.user.email });
    const decoded = jwt.decode(token) as { exp?: number } | null;
    return c.json({ token, expiresAt: decoded?.exp ? decoded.exp * 1000 : null });
  },
);

authRouter.get('/google', (c) => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_REDIRECT_URI) {
    return c.json({ message: 'Google OAuth not configured' }, 501);
  }
  const state = crypto.randomUUID();
  setCookie(c, 'oauth_state', state, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 600,
  });
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
  const profile = (await profileRes.json()) as {
    email: string;
    name: string;
    picture?: string;
    verified_email?: boolean;
  };

  if (!profile.verified_email) {
    throw new BadRequestError(
      'Google email is not verified. Please verify your email with Google first.',
    );
  }

  let user = await prisma.user.findUnique({ where: { email: profile.email } });
  if (!user) {
    user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email: profile.email,
          name: profile.name ?? profile.email,
          avatarUrl: profile.picture ?? null,
        },
      });
      await tx.workspace.create({
        data: {
          name: `${u.name}'s workspace`,
          slug: `ws-${u.id.slice(-6)}`,
          ownerId: u.id,
          members: { create: { userId: u.id, role: 'OWNER' } },
        },
      });
      return u;
    });
  }

  const access = signAccessToken({ userId: user.id, email: user.email });
  const tokenId = crypto.randomUUID();
  const refresh = signRefreshToken({ userId: user.id, tokenId });
  await prisma.refreshToken.create({
    data: {
      id: tokenId,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  setAuthCookies(c, access, refresh);

  return postLoginRedirect(c);
});
