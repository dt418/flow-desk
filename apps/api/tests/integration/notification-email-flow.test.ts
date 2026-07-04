import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getTestPrisma } from '../setup/integration';
import {
  cleanDatabase,
  createUser,
  createWorkspace,
  addMember,
  createColumn,
  createTask,
} from '../setup/factories';
import { taskService } from '../../src/modules/task/task.service';
import { emailQueue } from '../../src/workers/email/queue';

describe('notification → email flow', () => {
  let prisma: ReturnType<typeof getTestPrisma>;
  let ownerId: string;
  let assigneeId: string;
  let wid: string;
  let columnId: string;
  let taskId: string;

  beforeEach(async () => {
    prisma = getTestPrisma();
    await cleanDatabase(prisma);
    const owner = await createUser(prisma, 'owner@test.com', 'Owner');
    ownerId = owner.id;
    const assignee = await createUser(prisma, 'assignee@test.com', 'Assignee');
    assigneeId = assignee.id;
    const w = await createWorkspace(prisma, ownerId, 'FlowTest');
    wid = w.id;
    await addMember(prisma, wid, assigneeId, 'MEMBER');
    const col = await createColumn(prisma, wid, 'Todo', 0);
    columnId = col.id;
    const t = await createTask(prisma, wid, columnId, ownerId, 'Test Task');
    taskId = t.id;
  });

  it('creates notification and enqueues email when task assigned', async () => {
    const jobSpy = vi.spyOn(emailQueue, 'add').mockResolvedValue({} as never);

    await taskService.update(ownerId, taskId, {
      assigneeId,
      workspaceId: wid,
    } as never);

    const notifs = await prisma.notification.findMany({
      where: { userId: assigneeId },
    });
    expect(notifs).toHaveLength(1);
    expect(notifs[0]!.type).toBe('TASK_ASSIGNED');

    expect(jobSpy).toHaveBeenCalledTimes(1);
    const callArgs = jobSpy.mock.calls[0]!;
    expect(callArgs[0]).toBe('send');
    expect(callArgs[1]!.type).toBe('INSTANT');
    expect(callArgs[1]!.userId).toBe(assigneeId);

    jobSpy.mockRestore();
  });

  it('skips email when user notification preference disables taskAssignedEmail', async () => {
    await prisma.userNotificationPreference.create({
      data: {
        userId: assigneeId,
        taskAssignedEmail: false,
      },
    });

    const jobSpy = vi.spyOn(emailQueue, 'add').mockResolvedValue({} as never);

    await taskService.update(ownerId, taskId, {
      assigneeId,
      workspaceId: wid,
    } as never);

    const notifs = await prisma.notification.findMany({
      where: { userId: assigneeId },
    });
    expect(notifs).toHaveLength(1);
    expect(notifs[0]!.type).toBe('TASK_ASSIGNED');

    expect(jobSpy).not.toHaveBeenCalled();

    jobSpy.mockRestore();
  });

  it('creates notification on task creation with assignee', async () => {
    const jobSpy = vi.spyOn(emailQueue, 'add').mockResolvedValue({} as never);

    const newTask = await taskService.create(ownerId, {
      workspaceId: wid,
      columnId,
      title: 'Assigned on create',
      assigneeId,
    });
    void newTask;

    const notifs = await prisma.notification.findMany({
      where: { userId: assigneeId },
    });
    expect(notifs).toHaveLength(1);
    expect(notifs[0]!.type).toBe('TASK_ASSIGNED');

    expect(jobSpy).toHaveBeenCalledTimes(1);

    jobSpy.mockRestore();
  });

  it('creates EmailJob record when email is enqueued', async () => {
    const jobSpy = vi.spyOn(emailQueue, 'add').mockImplementation(async () => ({}) as never);

    await taskService.update(ownerId, taskId, {
      assigneeId,
      workspaceId: wid,
    });

    const emailJobs = await prisma.emailJob.findMany();
    expect(emailJobs).toHaveLength(1);
    expect(emailJobs[0]!.type).toBe('INSTANT');
    expect(emailJobs[0]!.userId).toBe(assigneeId);
    expect(emailJobs[0]!.status).toBe('PENDING');

    jobSpy.mockRestore();
  });

  it('uses DELAYED status when user has email delay preference', async () => {
    await prisma.userNotificationPreference.create({
      data: {
        userId: assigneeId,
        taskAssignedEmail: true,
        emailDelayMinutes: 30,
      },
    });

    const jobSpy = vi.spyOn(emailQueue, 'add').mockResolvedValue({} as never);

    await taskService.update(ownerId, taskId, {
      assigneeId,
      workspaceId: wid,
    });

    const emailJobs = await prisma.emailJob.findMany();
    expect(emailJobs).toHaveLength(1);
    expect(emailJobs[0]!.status).toBe('PENDING');
    expect(emailJobs[0]!.scheduledAt).not.toBeNull();
    const delayMs = new Date(emailJobs[0]!.scheduledAt!).getTime() - Date.now();
    expect(delayMs).toBeGreaterThan(0);

    jobSpy.mockRestore();
  });
});
