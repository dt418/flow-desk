import { describe, it, expect, beforeEach } from 'vitest';
import { getTestPrisma } from '../setup/integration';
import { cleanDatabase, createUser, createWorkspace } from '../setup/factories';
import * as repo from '../../src/modules/label/label.repository';

describe('label.repository', () => {
  let prisma: ReturnType<typeof getTestPrisma>;
  beforeEach(async () => {
    prisma = getTestPrisma();
    await cleanDatabase(prisma);
  });

  it('createLabel persists name+color+workspaceId', async () => {
    const u = await createUser(prisma);
    const w = await createWorkspace(prisma, u.id);
    const label = await repo.createLabel(prisma, { workspaceId: w.id, name: 'bug', color: 'red' });
    expect(label).toMatchObject({ name: 'bug', color: 'red', workspaceId: w.id });
    expect(label.id).toBeDefined();
  });

  it('findByWorkspace returns only workspace labels', async () => {
    const u = await createUser(prisma);
    const w1 = await createWorkspace(prisma, u.id, 'ws1');
    const w2 = await createWorkspace(prisma, u.id, 'ws2');
    await repo.createLabel(prisma, { workspaceId: w1.id, name: 'a', color: 'red' });
    await repo.createLabel(prisma, { workspaceId: w2.id, name: 'b', color: 'blue' });
    const list = await repo.findByWorkspace(prisma, w1.id);
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('a');
  });

  it('countByWorkspace returns 0 when no labels', async () => {
    const u = await createUser(prisma);
    const w = await createWorkspace(prisma, u.id);
    expect(await repo.countByWorkspace(prisma, w.id)).toBe(0);
  });

  it('deleteLabel returns count (used for in-use check)', async () => {
    const u = await createUser(prisma);
    const w = await createWorkspace(prisma, u.id);
    const l = await repo.createLabel(prisma, { workspaceId: w.id, name: 'x', color: 'gray' });
    const result = await repo.deleteLabel(prisma, l.id);
    expect(result.count).toBe(1);
  });
});
