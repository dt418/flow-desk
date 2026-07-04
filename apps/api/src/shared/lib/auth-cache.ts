import { redis } from './redis';
import { prisma } from './prisma';

const AUTH_CACHE_TTL = 30;
const MEMBER_CACHE_TTL = 30;

export async function getCachedUser(userId: string) {
  const key = `auth:user:${userId}`;
  const cached = await redis.get(key);
  if (cached)
    return JSON.parse(cached) as {
      id: string;
      email: string;
      name: string;
      deletedAt: string | null;
    };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, avatarUrl: true, deletedAt: true },
  });
  if (user) {
    await redis.set(key, JSON.stringify(user), 'EX', AUTH_CACHE_TTL);
  }
  return user;
}

export async function getCachedMembership(workspaceId: string, userId: string) {
  const key = `auth:member:${workspaceId}:${userId}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached) as { role: string } | null;

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  await redis.set(key, JSON.stringify(member), 'EX', MEMBER_CACHE_TTL);
  return member;
}

export async function invalidateMembershipCache(workspaceId: string, userId: string) {
  await redis.del(`auth:member:${workspaceId}:${userId}`);
}

export async function invalidateUserCache(userId: string) {
  await redis.del(`auth:user:${userId}`);
}
