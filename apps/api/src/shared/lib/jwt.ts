import jwt from 'jsonwebtoken';
import { env } from './prisma';

export interface AccessTokenPayload {
  userId: string;
  email: string;
}

export interface RefreshTokenPayload {
  userId: string;
  tokenId: string;
}

export interface SocketTokenPayload {
  userId: string;
  email: string;
  scope: 'socket';
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_ACCESS_TTL } as jwt.SignOptions);
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_REFRESH_TTL } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload & jwt.JwtPayload;
  if (typeof decoded.exp !== 'number') throw new Error('Invalid token: missing exp');
  if (decoded.exp * 1000 <= Date.now()) throw new Error('Invalid token: expired');
  if (!decoded.userId || !decoded.email) throw new Error('Invalid token payload');
  return decoded;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET) as RefreshTokenPayload & jwt.JwtPayload;
  if (typeof decoded.exp !== 'number') throw new Error('Invalid token: missing exp');
  if (decoded.exp * 1000 <= Date.now()) throw new Error('Invalid token: expired');
  if (!decoded.userId || !decoded.tokenId) throw new Error('Invalid token payload');
  return decoded;
}

// ponytail: short-lived, JS-readable token for socket handshake only. Scoped so
// a leaked client-side token can't be used against REST (which needs the
// httpOnly access cookie). Beyond the scope claim it's a normal access token.
export function signSocketToken(payload: AccessTokenPayload): string {
  const scoped: SocketTokenPayload = { ...payload, scope: 'socket' };
  return jwt.sign(scoped, env.JWT_SECRET, {
    expiresIn: env.JWT_SOCKET_TTL,
  } as jwt.SignOptions);
}

export function verifySocketToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET) as (AccessTokenPayload & jwt.JwtPayload) & {
    scope?: string;
  };
  if (decoded.scope !== 'socket') throw new Error('Invalid token: wrong scope');
  if (typeof decoded.exp !== 'number') throw new Error('Invalid token: missing exp');
  if (decoded.exp * 1000 <= Date.now()) throw new Error('Invalid token: expired');
  if (!decoded.userId || !decoded.email) throw new Error('Invalid token payload');
  return { userId: decoded.userId, email: decoded.email };
}
