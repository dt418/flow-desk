import { prisma } from './prisma';
import { BadRequestError } from '../errors';

export async function assertMembership(workspaceId: string, userId: string) {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!member) throw new BadRequestError('Not a member of this workspace');
  return member;
}