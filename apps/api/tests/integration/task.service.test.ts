import { describe, it, expect, beforeEach } from 'vitest';
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
import { ConflictError, BadRequestError, NotFoundError } from '../../src/shared/errors';

describe('task.service', () => {
  let prisma: ReturnType<typeof getTestPrisma>;
  let ownerId: string, memberId: string, outsiderId: string, wid: string;
  let colTodo: { id: string }, colDone: { id: string };
  let taskId: string;

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
    colTodo = await createColumn(prisma, wid, 'Todo', 0);
    colDone = await prisma.column.create({
      data: { workspaceId: wid, name: 'Done', position: 1, isDoneColumn: true },
    });
    const t = await createTask(prisma, wid, colTodo.id, owner.id, 'Sample');
    taskId = t.id;
  });

  describe('list', () => {
    it('returns paginated tasks for member (cursor)', async () => {
      await prisma.task.create({
        data: { workspaceId: wid, columnId: colTodo.id, title: 'B', createdById: ownerId },
      });
      const res = await taskService.list({ workspaceId: wid, limit: 10 } as never, ownerId);
      expect(res.data.length).toBeGreaterThanOrEqual(2);
      expect(res.nextCursor === null || typeof res.nextCursor === 'string').toBe(true);
    });

    it('filters by status, priority, search', async () => {
      await prisma.task.create({
        data: {
          workspaceId: wid,
          columnId: colTodo.id,
          title: 'unique-findme',
          createdById: ownerId,
          priority: 'HIGH',
          status: 'IN_PROGRESS',
          assigneeId: memberId,
        },
      });
      const bySearch = await taskService.list(
        { workspaceId: wid, search: 'findme', limit: 10 } as never,
        ownerId,
      );
      expect(bySearch.data.length).toBe(1);
      const byStatus = await taskService.list(
        { workspaceId: wid, status: 'IN_PROGRESS', limit: 10 } as never,
        ownerId,
      );
      expect(byStatus.data.length).toBe(1);
    });

    it('non-member rejected', async () => {
      await expect(
        taskService.list({ workspaceId: wid, limit: 10 } as never, outsiderId),
      ).rejects.toThrow(BadRequestError);
    });

    it('limit=1 + cursor pagination across 3 tasks', async () => {
      await prisma.task.create({
        data: { workspaceId: wid, columnId: colTodo.id, title: 'B', createdById: ownerId },
      });
      await prisma.task.create({
        data: { workspaceId: wid, columnId: colTodo.id, title: 'C', createdById: ownerId },
      });
      const p1 = await taskService.list({ workspaceId: wid, limit: 1 } as never, ownerId);
      expect(p1.data.length).toBe(1);
      expect(p1.nextCursor).not.toBeNull();
      const p2 = await taskService.list(
        { workspaceId: wid, limit: 1, cursor: p1.nextCursor! } as never,
        ownerId,
      );
      expect(p2.data.length).toBe(1);
    });
  });

  describe('create', () => {
    it('creates with auto position', async () => {
      const t = await taskService.create(ownerId, {
        workspaceId: wid,
        columnId: colTodo.id,
        title: 'New',
        priority: 'MEDIUM',
        status: 'TODO',
      });
      expect(t.title).toBe('New');
      expect(t.position).toBeGreaterThan(0);
    });

    it('parent honoured', async () => {
      const child = await taskService.create(ownerId, {
        workspaceId: wid,
        columnId: colTodo.id,
        title: 'child',
        priority: 'MEDIUM',
        status: 'TODO',
        parentTaskId: taskId,
      });
      expect(child.parentTaskId).toBe(taskId);
    });

    it('non-member rejected', async () => {
      await expect(
        taskService.create(outsiderId, {
          workspaceId: wid,
          columnId: colTodo.id,
          title: 'x',
          priority: 'MEDIUM',
          status: 'TODO',
        }),
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('get', () => {
    it('returns task with relations', async () => {
      const t = await taskService.get(memberId, taskId);
      expect(t.id).toBe(taskId);
      expect(t._count).toBeDefined();
    });

    it('non-member rejected', async () => {
      await expect(taskService.get(outsiderId, taskId)).rejects.toThrow(BadRequestError);
    });

    it('404 for missing', async () => {
      await expect(taskService.get(ownerId, 'nope')).rejects.toThrow(NotFoundError);
    });
  });

  describe('update', () => {
    it('bumps version', async () => {
      const u = await taskService.update(ownerId, taskId, { title: 'Renamed' });
      expect(u.title).toBe('Renamed');
      expect(u.version).toBe(1);
    });

    it('version conflict (409)', async () => {
      await expect(
        taskService.update(ownerId, taskId, { title: 'x', version: 999 }),
      ).rejects.toThrow(ConflictError);
    });

    it('404 for missing', async () => {
      await expect(taskService.update(ownerId, 'missing', { title: 'x' })).rejects.toThrow(
        NotFoundError,
      );
    });

    it('non-member rejected', async () => {
      await expect(taskService.update(outsiderId, taskId, { title: 'x' })).rejects.toThrow(
        BadRequestError,
      );
    });
  });

  describe('delete', () => {
    it('soft deletes', async () => {
      await taskService.delete(ownerId, taskId);
      const t = await prisma.task.findUnique({ where: { id: taskId } });
      expect(t?.deletedAt).not.toBeNull();
    });

    it('404 for missing', async () => {
      await expect(taskService.delete(ownerId, 'missing')).rejects.toThrow(NotFoundError);
    });
  });

  describe('move', () => {
    it('to done column sets status DONE', async () => {
      const moved = await taskService.move(ownerId, taskId, {
        columnId: colDone.id,
        position: 0,
        version: 0,
      });
      expect(moved?.columnId).toBe(colDone.id);
      expect(moved?.status).toBe('DONE');
      expect(moved?.completedAt).not.toBeNull();
    });

    it('version conflict (409)', async () => {
      await expect(
        taskService.move(ownerId, taskId, { columnId: colDone.id, position: 0, version: 999 }),
      ).rejects.toThrow(ConflictError);
    });

    it('invalid target column (400)', async () => {
      const otherWs = await createWorkspace(prisma, ownerId, 'other');
      const otherCol = await createColumn(prisma, otherWs.id, 'X', 0);
      await expect(
        taskService.move(ownerId, taskId, { columnId: otherCol.id, position: 0, version: 0 }),
      ).rejects.toThrow(BadRequestError);
    });

    it('reorder within same column', async () => {
      const tA = await prisma.task.create({
        data: {
          workspaceId: wid,
          columnId: colTodo.id,
          title: 'A',
          createdById: ownerId,
          position: 1,
        },
      });
      await prisma.task.create({
        data: {
          workspaceId: wid,
          columnId: colTodo.id,
          title: 'C',
          createdById: ownerId,
          position: 2,
        },
      });
      const moved = await taskService.move(ownerId, tA.id, {
        columnId: colTodo.id,
        position: 2,
        version: 0,
      });
      expect(moved?.position).toBe(2);
    });
  });

  describe('createSubtask', () => {
    it('happy', async () => {
      const sub = await taskService.createSubtask(ownerId, taskId, {
        workspaceId: wid,
        columnId: colTodo.id,
        title: 'sub',
        priority: 'LOW',
        status: 'TODO',
      });
      expect(sub.parentTaskId).toBe(taskId);
    });

    it('parent 404', async () => {
      await expect(
        taskService.createSubtask(ownerId, 'missing', {
          workspaceId: wid,
          columnId: colTodo.id,
          title: 'sub',
          priority: 'LOW',
          status: 'TODO',
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('createDependency', () => {
    it('happy', async () => {
      const t2 = await prisma.task.create({
        data: { workspaceId: wid, columnId: colTodo.id, title: 'B', createdById: ownerId },
      });
      const dep = await taskService.createDependency(ownerId, {
        blockingTaskId: taskId,
        blockedTaskId: t2.id,
      });
      expect(dep.blockingTaskId).toBe(taskId);
    });

    it('self-block (400)', async () => {
      await expect(
        taskService.createDependency(ownerId, { blockingTaskId: taskId, blockedTaskId: taskId }),
      ).rejects.toThrow(BadRequestError);
    });

    it('missing task (404)', async () => {
      await expect(
        taskService.createDependency(ownerId, { blockingTaskId: taskId, blockedTaskId: 'missing' }),
      ).rejects.toThrow(NotFoundError);
    });

    it('cross-workspace (400)', async () => {
      const w2 = await createWorkspace(prisma, ownerId, 'ws2');
      const col2 = await createColumn(prisma, w2.id, 'T', 0);
      const t2 = await createTask(prisma, w2.id, col2.id, ownerId, 'in-w2');
      await expect(
        taskService.createDependency(ownerId, { blockingTaskId: taskId, blockedTaskId: t2.id }),
      ).rejects.toThrow(BadRequestError);
    });

    it('duplicate (409)', async () => {
      const t2 = await prisma.task.create({
        data: { workspaceId: wid, columnId: colTodo.id, title: 'B', createdById: ownerId },
      });
      await taskService.createDependency(ownerId, { blockingTaskId: taskId, blockedTaskId: t2.id });
      await expect(
        taskService.createDependency(ownerId, { blockingTaskId: taskId, blockedTaskId: t2.id }),
      ).rejects.toThrow(ConflictError);
    });

    it('cycle (400)', async () => {
      const tA = await prisma.task.create({
        data: { workspaceId: wid, columnId: colTodo.id, title: 'A', createdById: ownerId },
      });
      const tB = await prisma.task.create({
        data: { workspaceId: wid, columnId: colTodo.id, title: 'B', createdById: ownerId },
      });
      await taskService.createDependency(ownerId, { blockingTaskId: tA.id, blockedTaskId: tB.id });
      await expect(
        taskService.createDependency(ownerId, { blockingTaskId: tB.id, blockedTaskId: tA.id }),
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('deleteDependency', () => {
    it('happy', async () => {
      const t2 = await prisma.task.create({
        data: { workspaceId: wid, columnId: colTodo.id, title: 'B', createdById: ownerId },
      });
      const dep = await taskService.createDependency(ownerId, {
        blockingTaskId: taskId,
        blockedTaskId: t2.id,
      });
      await taskService.deleteDependency(dep.id);
      const after = await prisma.taskDependency.findUnique({ where: { id: dep.id } });
      expect(after).toBeNull();
    });
  });
});
