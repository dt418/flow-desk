import { describe, it, expect, beforeEach } from 'vitest';
import { getTestPrisma } from '../setup/integration';
import { cleanDatabase, createUser, createWorkspace, addMember } from '../setup/factories';
import { workspaceService } from '../../src/modules/workspace/workspace.service';
import { BadRequestError, ForbiddenError } from '../../src/shared/errors';

describe('workspace.service', () => {
  let prisma: ReturnType<typeof getTestPrisma>;

  beforeEach(async () => {
    prisma = getTestPrisma();
    await cleanDatabase(prisma);
  });

  it('create creates workspace with default columns', async () => {
    const u = await createUser(prisma);
    const ws = await workspaceService.create('My Project', u.id);
    expect(ws.name).toBe('My Project');
    expect(ws.ownerId).toBe(u.id);
    const cols = await prisma.column.findMany({ where: { workspaceId: ws.id } });
    expect(cols.length).toBeGreaterThanOrEqual(4);
  });

  it('create rejects empty name', async () => {
    const u = await createUser(prisma);
    await expect(workspaceService.create('', u.id)).rejects.toThrow(BadRequestError);
  });

  it('list returns workspaces for user', async () => {
    const u = await createUser(prisma);
    await createWorkspace(prisma, u.id, 'WS1');
    await createWorkspace(prisma, u.id, 'WS2');
    const list = await workspaceService.list({ limit: 20 }, u.id);
    expect(list.data).toHaveLength(2);
  });

  it('rename requires OWNER or ADMIN', async () => {
    const owner = await createUser(prisma, 'owner@x');
    const member = await createUser(prisma, 'member@x');
    const w = await createWorkspace(prisma, owner.id);
    await addMember(prisma, w.id, member.id, 'MEMBER');
    await expect(workspaceService.rename(w.id, 'NewName', member.id)).rejects.toThrow(ForbiddenError);
    const renamed = await workspaceService.rename(w.id, 'NewName', owner.id);
    expect(renamed.name).toBe('NewName');
  });

  it('softDelete requires OWNER', async () => {
    const owner = await createUser(prisma, 'owner@x');
    const admin = await createUser(prisma, 'admin@x');
    const w = await createWorkspace(prisma, owner.id);
    await addMember(prisma, w.id, admin.id, 'ADMIN');
    await expect(workspaceService.softDelete(w.id, admin.id)).rejects.toThrow(ForbiddenError);
    await workspaceService.softDelete(w.id, owner.id);
    const after = await prisma.workspace.findUnique({ where: { id: w.id } });
    expect(after?.deletedAt).not.toBeNull();
  });
});