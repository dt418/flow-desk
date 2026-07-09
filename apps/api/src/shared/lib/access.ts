import { prisma } from './prisma';
import { BadRequestError, ForbiddenError } from '../errors';

export async function assertMembership(workspaceId: string, userId: string) {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!member) throw new BadRequestError('Not a member of this workspace');
  return member;
}

export async function assertRole(
  workspaceId: string,
  userId: string,
  allowed: Array<'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST'>,
) {
  const member = await assertMembership(workspaceId, userId);
  if (!allowed.includes(member.role)) {
    throw new ForbiddenError(`Required role: ${allowed.join(', ')}`);
  }
  return member;
}
