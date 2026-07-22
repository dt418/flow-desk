import { prisma } from './prisma';
import { BadRequestError, ForbiddenError, NotFoundError } from '../errors';

export async function assertMembership(workspaceId: string, userId: string) {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!member) throw new BadRequestError('Not a member of this workspace');
  // Defense in depth: member row survives soft-delete of the workspace.
  // Reject so all downstream calls treat the workspace as gone.
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { deletedAt: true },
  });
  if (!ws || ws.deletedAt) throw new NotFoundError('Workspace not found');
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

/** Roles that may mutate workspace data (GUEST is read-only). */
export const WORKSPACE_WRITER_ROLES = ['OWNER', 'ADMIN', 'MEMBER'] as const;

export async function assertCanWriteWorkspace(workspaceId: string, userId: string) {
  return assertRole(workspaceId, userId, [...WORKSPACE_WRITER_ROLES]);
}
