import { describe, it, expect, beforeEach } from 'vitest';
import { getTestPrisma } from '../setup/integration';
import { cleanDatabase, createUser, createWorkspace, addMember } from '../setup/factories';
import { memberService } from '../../src/modules/workspace/member.service';
import {
  ConflictError,
  ForbiddenError,
  BadRequestError,
  NotFoundError,
} from '../../src/shared/errors';

describe('member.service', () => {
  let prisma: ReturnType<typeof getTestPrisma>;
  let ownerId: string, adminId: string, memberId: string, targetId: string;
  let wid: string;

  beforeEach(async () => {
    prisma = getTestPrisma();
    await cleanDatabase(prisma);
    const owner = await createUser(prisma, 'owner@x');
    const admin = await createUser(prisma, 'admin@x');
    const member = await createUser(prisma, 'member@x');
    const target = await createUser(prisma, 'target@x');
    ownerId = owner.id;
    adminId = admin.id;
    memberId = member.id;
    targetId = target.id;

    const w = await createWorkspace(prisma, owner.id);
    wid = w.id;
    await addMember(prisma, wid, admin.id, 'ADMIN');
    await addMember(prisma, wid, member.id, 'MEMBER');
    await addMember(prisma, wid, target.id, 'MEMBER');
  });

  it('list returns workspace members', async () => {
    const list = await memberService.list({ limit: 20 }, wid, ownerId);
    expect(list.data.length).toBeGreaterThanOrEqual(4);
  });

  it('list requires membership', async () => {
    const outsider = await createUser(prisma, 'out@x');
    await expect(memberService.list({ limit: 20 }, wid, outsider.id)).rejects.toThrow(
      BadRequestError,
    );
  });

  it('inviteByEmail requires OWNER or ADMIN', async () => {
    const newUser = await createUser(prisma, 'new@x');
    await expect(
      memberService.inviteByEmail(wid, newUser.email, 'MEMBER', memberId),
    ).rejects.toThrow(ForbiddenError);
  });

  it('inviteByEmail adds new member', async () => {
    const newUser = await createUser(prisma, 'newbie@x');
    const m = await memberService.inviteByEmail(wid, newUser.email, 'MEMBER', ownerId);
    expect(m.userId).toBe(newUser.id);
    expect(m.role).toBe('MEMBER');
  });

  it('inviteByEmail rejects unregistered user', async () => {
    await expect(
      memberService.inviteByEmail(wid, 'nobody@x.com', 'MEMBER', ownerId),
    ).rejects.toThrow(NotFoundError);
  });

  it('inviteByEmail rejects duplicate', async () => {
    await expect(
      memberService.inviteByEmail(
        wid,
        (await prisma.user.findUnique({ where: { id: targetId } }))!.email,
        'MEMBER',
        ownerId,
      ),
    ).rejects.toThrow(ConflictError);
  });

  it('changeRole requires OWNER', async () => {
    await expect(memberService.changeRole(wid, memberId, 'ADMIN', adminId)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it('changeRole OWNER can promote', async () => {
    const m = await memberService.changeRole(wid, memberId, 'ADMIN', ownerId);
    expect(m.role).toBe('ADMIN');
  });

  it('changeRole cannot demote last OWNER', async () => {
    await expect(memberService.changeRole(wid, ownerId, 'ADMIN', ownerId)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it('remove requires OWNER or ADMIN', async () => {
    await expect(memberService.remove(wid, targetId, memberId)).rejects.toThrow(ForbiddenError);
  });

  it('remove blocks self-removal', async () => {
    await expect(memberService.remove(wid, adminId, adminId)).rejects.toThrow(BadRequestError);
  });

  it('remove blocks last owner', async () => {
    await expect(memberService.remove(wid, ownerId, ownerId)).rejects.toThrow(ForbiddenError);
  });

  it('remove deletes member', async () => {
    await memberService.remove(wid, targetId, adminId);
    const after = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: wid, userId: targetId } },
    });
    expect(after).toBeNull();
  });
});
