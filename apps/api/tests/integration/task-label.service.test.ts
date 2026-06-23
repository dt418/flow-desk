import { describe, it, expect, beforeEach } from 'vitest';
import { getTestPrisma } from '../setup/integration';
import { cleanDatabase, createUser, createWorkspace, addMember, createTask, createColumn } from '../setup/factories';
import { taskLabelService } from '../../src/modules/task/task-label.service';
import { taskLabelRepo } from '../../src/modules/task/task-label.repository';
import { ConflictError, NotFoundError } from '../../src/shared/errors';

describe('task-label.service', () => {
  let prisma: ReturnType<typeof getTestPrisma>;
  let ownerId: string, memberId: string, outsiderId: string, wid: string, w2id: string;
  let taskId: string, labelId: string, w2LabelId: string;

  beforeEach(async () => { prisma = getTestPrisma();
    await cleanDatabase(prisma);
    const owner = await createUser(prisma, 'owner@test.com');
    const member = await createUser(prisma, 'member@test.com');
    const outsider = await createUser(prisma, 'outsider@test.com');
    ownerId = owner.id; memberId = member.id; outsiderId = outsider.id;

    const w = await createWorkspace(prisma, owner.id, 'WS1');
    wid = w.id;
    await addMember(prisma, wid, member.id, 'MEMBER');

    const w2 = await createWorkspace(prisma, owner.id, 'WS2');
    w2id = w2.id;

    const col = await createColumn(prisma, wid);
    const t = await createTask(prisma, wid, col.id, owner.id);
    taskId = t.id;

    const l = await prisma.taskLabel.create({ data: { workspaceId: wid, name: 'bug', color: 'red' } });
    labelId = l.id;
    const l2 = await prisma.taskLabel.create({ data: { workspaceId: w2id, name: 'foreign', color: 'blue' } });
    w2LabelId = l2.id;
  });

  it('assign creates row + dual-writes JSON', async () => {
    await taskLabelService.assign(wid, taskId, labelId, ownerId);
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    const labels = (task?.labelsDeprecated as string[]) ?? [];
    expect(labels).toEqual(['bug']);
    const rows = await prisma.taskLabelAssignment.findMany({ where: { taskId, deletedAt: null } });
    expect(rows).toHaveLength(1);
  });

  it('assign duplicate label name is idempotent on JSON', async () => {
    await taskLabelService.assign(wid, taskId, labelId, ownerId);
    await taskLabelService.assign(wid, taskId, labelId, ownerId);
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    const labels = (task?.labelsDeprecated as string[]) ?? [];
    expect(labels).toEqual(['bug']);
  });

  it('unassign soft-deletes row + removes from JSON', async () => {
    await taskLabelService.assign(wid, taskId, labelId, ownerId);
    await taskLabelService.unassign(wid, taskId, labelId, ownerId);
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    expect(task?.labelsDeprecated).toEqual([]);
    const rows = await prisma.taskLabelAssignment.findMany({ where: { taskId, deletedAt: null } });
    expect(rows).toHaveLength(0);
  });

  it('cross-workspace label assign → NotFoundError', async () => {
    await expect(
      taskLabelService.assign(wid, taskId, w2LabelId, ownerId),
    ).rejects.toThrow(NotFoundError);
  });

  it('non-member assign rejected', async () => {
    await expect(
      taskLabelService.assign(wid, taskId, labelId, outsiderId),
    ).rejects.toThrow();
  });

  it('listForTask returns labels', async () => {
    await taskLabelService.assign(wid, taskId, labelId, ownerId);
    const labels = await taskLabelService.listForTask(wid, taskId, ownerId);
    expect(labels).toHaveLength(1);
    expect(labels[0]?.name).toBe('bug');
  });

  it('taskLabelRepo.listForTask returns rows with labels', async () => {
    await taskLabelService.assign(wid, taskId, labelId, ownerId);
    const rows = await taskLabelRepo.listForTask(taskId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.label.name).toBe('bug');
  });
});
