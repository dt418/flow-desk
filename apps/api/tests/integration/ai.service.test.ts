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
import * as svc from '../../src/modules/ai/ai.service';
import { prisma as db } from '../../src/shared/lib/prisma';
import { BadRequestError, NotFoundError } from '../../src/shared/errors';

describe('ai.service', () => {
  let prisma: ReturnType<typeof getTestPrisma>;
  let ownerId: string, outsiderId: string;
  let wid: string;
  let colTodo: { id: string };

  beforeEach(async () => {
    prisma = getTestPrisma();
    await cleanDatabase(prisma);
    const owner = await createUser(prisma, 'owner@test.com');
    const member = await createUser(prisma, 'member@test.com');
    const outsider = await createUser(prisma, 'outsider@test.com');
    ownerId = owner.id;
    void member;
    outsiderId = outsider.id;
    const w = await createWorkspace(prisma, owner.id);
    wid = w.id;
    await addMember(prisma, wid, member.id, 'MEMBER');
    colTodo = await createColumn(prisma, wid);
  });

  describe('suggestAssignee', () => {
    it('falls back to rule-based when LLM unavailable', async () => {
      const res = await svc.suggestAssignee(db, ownerId, { workspaceId: wid, title: 'do thing' });
      expect(res.suggestions.length).toBeGreaterThan(0);
      expect(res.suggestions.length).toBeLessThanOrEqual(3);
      expect(res.fallback).toBe(true);
      // Invalid key / upstream error → error reason; abort after 5s → timeout.
      expect(res.fallbackReason === 'error' || res.fallbackReason === 'timeout').toBe(true);
    });

    it('uses taskId to fill title', async () => {
      const t = await createTask(prisma, wid, colTodo.id, ownerId, 'preexisting title');
      const res = await svc.suggestAssignee(db, ownerId, { workspaceId: wid, taskId: t.id });
      expect(res.suggestions.length).toBeGreaterThan(0);
    });

    it('non-member rejected', async () => {
      await expect(
        svc.suggestAssignee(db, outsiderId, { workspaceId: wid, title: 'x' }),
      ).rejects.toThrow(BadRequestError);
    });

    it('missing task (404)', async () => {
      await expect(
        svc.suggestAssignee(db, ownerId, { workspaceId: wid, taskId: 'missing' }),
      ).rejects.toThrow(NotFoundError);
    });

    it('no title or taskId (400)', async () => {
      await expect(svc.suggestAssignee(db, ownerId, { workspaceId: wid })).rejects.toThrow(
        BadRequestError,
      );
    });
  });

  describe('autoSchedule', () => {
    it('schedules tasks respecting deps', async () => {
      const tA = await prisma.task.create({
        data: {
          workspaceId: wid,
          columnId: colTodo.id,
          title: 'A',
          createdById: ownerId,
          dueDate: new Date(Date.now() + 5 * 86400000),
        },
      });
      const tB = await prisma.task.create({
        data: {
          workspaceId: wid,
          columnId: colTodo.id,
          title: 'B',
          createdById: ownerId,
          dueDate: new Date(Date.now() + 10 * 86400000),
        },
      });
      await prisma.taskDependency.create({ data: { blockingTaskId: tA.id, blockedTaskId: tB.id } });
      const res = await svc.autoSchedule(db, ownerId, { workspaceId: wid });
      expect(res.schedule).toHaveLength(2);
      const ids = res.schedule.map((s) => s.taskId);
      expect(ids.indexOf(tA.id)).toBeLessThan(ids.indexOf(tB.id));
    });

    it('detects cycle (400)', async () => {
      const tA = await prisma.task.create({
        data: { workspaceId: wid, columnId: colTodo.id, title: 'A', createdById: ownerId },
      });
      const tB = await prisma.task.create({
        data: { workspaceId: wid, columnId: colTodo.id, title: 'B', createdById: ownerId },
      });
      await prisma.taskDependency.create({ data: { blockingTaskId: tA.id, blockedTaskId: tB.id } });
      await prisma.taskDependency.create({ data: { blockingTaskId: tB.id, blockedTaskId: tA.id } });
      await expect(svc.autoSchedule(db, ownerId, { workspaceId: wid })).rejects.toThrow(
        BadRequestError,
      );
    });

    it('non-member rejected', async () => {
      await expect(svc.autoSchedule(db, outsiderId, { workspaceId: wid })).rejects.toThrow(
        BadRequestError,
      );
    });
  });
});
