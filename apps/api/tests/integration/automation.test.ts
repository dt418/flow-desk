import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getTestPrisma } from '../setup/integration';
import {
  cleanDatabase,
  createUser,
  createWorkspace,
  getAuthCookie,
  createTask,
  createColumn,
} from '../setup/factories';
import { buildApp } from '../../src/app';

const { mockWebhookQueueAdd } = vi.hoisted(() => ({
  mockWebhookQueueAdd: vi.fn().mockResolvedValue({ id: 'job-1' }),
}));
vi.mock('../../src/workers/webhook/queue', () => ({
  webhookQueue: { add: mockWebhookQueueAdd },
  createWebhookWorker: vi.fn(),
}));

describe('Automation rules (P2-1)', () => {
  let prisma: ReturnType<typeof getTestPrisma>;

  beforeEach(async () => {
    prisma = getTestPrisma();
    await cleanDatabase(prisma);
    mockWebhookQueueAdd.mockClear();
  });

  async function setup() {
    const owner = await createUser(prisma, 'rules@test.local', 'Owner');
    const w = await createWorkspace(prisma, owner.id, 'Rules WS');
    const cookie = await getAuthCookie(prisma, owner.id);
    return { ownerId: owner.id, wid: w.id, cookie };
  }

  it('creates and lists a rule', async () => {
    const { wid, cookie } = await setup();
    const app = buildApp();
    const createRes = await app.request(`/api/workspaces/${wid}/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        name: 'Assign owner on review',
        trigger: 'STATUS_CHANGED',
        condition: { field: 'newValue', op: 'eq', value: 'IN_REVIEW' },
        action: { type: 'assign', assigneeId: 'workspace-owner' },
        isActive: true,
      }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.name).toBe('Assign owner on review');
    expect(created.trigger).toBe('STATUS_CHANGED');

    const listRes = await app.request(`/api/workspaces/${wid}/rules`, {
      headers: { Cookie: cookie },
    });
    expect(listRes.status).toBe(200);
    const list = await listRes.json();
    expect(list.data).toHaveLength(1);
  });

  it('STATUS_CHANGED to IN_REVIEW assigns workspace owner and logs SUCCESS', async () => {
    const { ownerId, wid, cookie } = await setup();
    const app = buildApp();
    await app.request(`/api/workspaces/${wid}/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        name: 'Owner on review',
        trigger: 'STATUS_CHANGED',
        condition: { field: 'newValue', op: 'eq', value: 'IN_REVIEW' },
        action: { type: 'assign', assigneeId: 'workspace-owner' },
      }),
    });

    const col = await createColumn(prisma, wid, 'Review', 5);
    const task = await createTask(prisma, wid, col.id, ownerId, 'Needs review');
    // Clear assignee
    await prisma.task.update({ where: { id: task.id }, data: { assigneeId: null } });

    const { activityService } = await import('../../src/modules/activity/activity.service');
    const activity = await activityService.record({
      taskId: task.id,
      userId: ownerId,
      action: 'STATUS_CHANGED',
      field: 'status',
      oldValue: 'TODO',
      newValue: 'IN_REVIEW',
    });
    expect(activity).not.toBeNull();

    const updated = await prisma.task.findUnique({ where: { id: task.id } });
    expect(updated?.assigneeId).toBe(ownerId);

    const execs = await prisma.ruleExecution.findMany({ where: { activityId: activity!.id } });
    expect(execs).toHaveLength(1);
    expect(execs[0]!.status).toBe('SUCCESS');
  });

  it('skips when condition does not match', async () => {
    const { ownerId, wid, cookie } = await setup();
    const app = buildApp();
    await app.request(`/api/workspaces/${wid}/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        name: 'Only DONE',
        trigger: 'STATUS_CHANGED',
        condition: { field: 'newValue', op: 'eq', value: 'DONE' },
        action: { type: 'assign', assigneeId: 'workspace-owner' },
      }),
    });
    const col = await createColumn(prisma, wid, 'Todo2', 6);
    const task = await createTask(prisma, wid, col.id, ownerId, 'Skip me');
    await prisma.task.update({ where: { id: task.id }, data: { assigneeId: null } });

    const { activityService } = await import('../../src/modules/activity/activity.service');
    const activity = await activityService.record({
      taskId: task.id,
      userId: ownerId,
      action: 'STATUS_CHANGED',
      field: 'status',
      oldValue: 'TODO',
      newValue: 'IN_PROGRESS',
    });

    const updated = await prisma.task.findUnique({ where: { id: task.id } });
    expect(updated?.assigneeId).toBeNull();
    const execs = await prisma.ruleExecution.findMany({ where: { activityId: activity!.id } });
    expect(execs[0]!.status).toBe('SKIPPED');
  });

  it('set-field action: rule sets priority to HIGH when triggered', async () => {
    const { ownerId, wid, cookie } = await setup();
    const app = buildApp();
    await app.request(`/api/workspaces/${wid}/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        name: 'High priority on review',
        trigger: 'STATUS_CHANGED',
        condition: { field: 'newValue', op: 'eq', value: 'IN_REVIEW' },
        action: { type: 'set-field', field: 'priority', value: 'HIGH' },
      }),
    });
    const col = await createColumn(prisma, wid, 'R2', 7);
    const task = await createTask(prisma, wid, col.id, ownerId, 'Priority me');
    await prisma.task.update({ where: { id: task.id }, data: { priority: 'LOW' } });

    const { activityService } = await import('../../src/modules/activity/activity.service');
    await activityService.record({
      taskId: task.id,
      userId: ownerId,
      action: 'STATUS_CHANGED',
      field: 'status',
      oldValue: 'TODO',
      newValue: 'IN_REVIEW',
    });

    const updated = await prisma.task.findUnique({ where: { id: task.id } });
    expect(updated?.priority).toBe('HIGH');
  });

  it('move-column action: rule moves task to Done column when triggered', async () => {
    const { ownerId, wid, cookie } = await setup();
    const app = buildApp();
    const doneCol = await createColumn(prisma, wid, 'DoneRule', 8);

    await app.request(`/api/workspaces/${wid}/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        name: 'Move to done on review',
        trigger: 'STATUS_CHANGED',
        condition: { field: 'newValue', op: 'eq', value: 'IN_REVIEW' },
        action: { type: 'move-column', columnId: doneCol.id },
      }),
    });
    const todoCol = await createColumn(prisma, wid, 'TodoRule', 9);
    const task = await createTask(prisma, wid, todoCol.id, ownerId, 'Move me');

    const { activityService } = await import('../../src/modules/activity/activity.service');
    await activityService.record({
      taskId: task.id,
      userId: ownerId,
      action: 'STATUS_CHANGED',
      field: 'status',
      oldValue: 'TODO',
      newValue: 'IN_REVIEW',
    });

    const updated = await prisma.task.findUnique({ where: { id: task.id } });
    expect(updated?.columnId).toBe(doneCol.id);
  });
});
