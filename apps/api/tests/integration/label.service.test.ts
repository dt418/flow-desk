import { describe, it, expect, beforeEach } from 'vitest';
import { getTestPrisma } from '../setup/integration';
import {
  cleanDatabase,
  createUser,
  createWorkspace,
  addMember,
  createTask,
  createColumn,
} from '../setup/factories';
import * as svc from '../../src/modules/label/label.service';
import {
  ConflictError,
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../../src/shared/errors';

describe('label.service', () => {
  let prisma: ReturnType<typeof getTestPrisma>;
  let ownerId: string, memberId: string, outsiderId: string, wid: string;
  let taskId: string, labelId: string;

  beforeEach(async () => {
    prisma = getTestPrisma();
    await cleanDatabase(prisma);
    const owner = await createUser(prisma, 'owner@test.com');
    const member = await createUser(prisma, 'member@test.com');
    const outsider = await createUser(prisma, 'outsider@test.com');
    ownerId = owner.id;
    memberId = member.id;
    outsiderId = outsider.id;
    const w = await createWorkspace(prisma, owner.id);
    wid = w.id;
    await addMember(prisma, wid, member.id, 'MEMBER');
    const col = await createColumn(prisma, wid);
    const t = await createTask(prisma, wid, col.id, owner.id);
    taskId = t.id;
    const l = await svc.createLabel(prisma, ownerId, wid, { name: 'bug', color: 'red' });
    labelId = l.id;
  });

  it('OWNER creates label', async () => {
    const l = await svc.createLabel(prisma, ownerId, wid, { name: 'feature', color: 'blue' });
    expect(l.color).toBe('blue');
  });

  it('non-owner (MEMBER) cannot create label', async () => {
    await expect(
      svc.createLabel(prisma, memberId, wid, { name: 'ui', color: 'green' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('non-member rejected', async () => {
    await expect(
      svc.createLabel(prisma, outsiderId, wid, { name: 'x', color: 'red' }),
    ).rejects.toThrow(BadRequestError);
  });

  it('duplicate name within workspace 409', async () => {
    await expect(
      svc.createLabel(prisma, ownerId, wid, { name: 'bug', color: 'red' }),
    ).rejects.toThrow(ConflictError);
  });

  it('100-label limit', async () => {
    for (let i = 0; i < 99; i++) {
      await svc.createLabel(prisma, ownerId, wid, { name: `l${i}`, color: 'gray' });
    }
    await expect(
      svc.createLabel(prisma, ownerId, wid, { name: 'l99', color: 'gray' }),
    ).rejects.toThrow(BadRequestError);
  });

  it('cross-workspace assign throws TASK_LABEL_CROSS_WORKSPACE', async () => {
    const w2 = await createWorkspace(prisma, ownerId, 'ws2');
    const labelInW2 = await svc.createLabel(prisma, ownerId, w2.id, {
      name: 'foreign',
      color: 'red',
    });
    await expect(svc.assignToTask(prisma, ownerId, taskId, [labelInW2.id])).rejects.toMatchObject({
      code: 'TASK_LABEL_CROSS_WORKSPACE',
    });
  });

  it('assignToTask replaces all + dual-writes labelsDeprecated', async () => {
    await svc.assignToTask(prisma, ownerId, taskId, [labelId]);
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    expect(task?.labelsDeprecated).toEqual(['bug']);
    const assignments = await prisma.taskLabelAssignment.findMany({
      where: { taskId, deletedAt: null },
    });
    expect(assignments).toHaveLength(1);
  });

  it('cascade: deleting label removes assignments', async () => {
    await svc.assignToTask(prisma, ownerId, taskId, [labelId]);
    await prisma.taskLabelAssignment.deleteMany({ where: { labelId } });
    const assignments = await prisma.taskLabelAssignment.findMany({
      where: { labelId, deletedAt: null },
    });
    expect(assignments).toHaveLength(0);
  });

  it('in-use label delete blocked', async () => {
    await svc.assignToTask(prisma, ownerId, taskId, [labelId]);
    await expect(svc.deleteLabel(prisma, ownerId, wid, labelId)).rejects.toMatchObject({
      code: 'LABEL_IN_USE',
    });
  });
});
