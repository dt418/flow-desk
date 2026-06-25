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
import * as svc from '../../src/modules/comment/comment.service';
import { prisma as db } from '../../src/shared/lib/prisma';
import { BadRequestError, NotFoundError } from '../../src/shared/errors';

describe('comment.service', () => {
  let prisma: ReturnType<typeof getTestPrisma>;
  let ownerId: string, memberId: string, outsiderId: string, wid: string;
  let taskId: string;

  beforeEach(async () => {
    prisma = getTestPrisma();
    await cleanDatabase(prisma);
    const owner = await createUser(prisma, 'owner@test.com', 'alice');
    const member = await createUser(prisma, 'member@test.com', 'bob');
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
  });

  describe('listComments', () => {
    it('returns comments for task (cursor)', async () => {
      await svc.createComment(db, ownerId, { taskId, content: 'hi' });
      await svc.createComment(db, memberId, { taskId, content: 'hey' });
      const res = await svc.listComments(db, ownerId, { taskId, limit: 10 } as never);
      expect(res.data).toHaveLength(2);
      expect(res.nextCursor === null || typeof res.nextCursor === 'string').toBe(true);
    });

    it('pagination across pages', async () => {
      for (let i = 0; i < 3; i++)
        await svc.createComment(db, ownerId, { taskId, content: `c${i}` });
      const p1 = await svc.listComments(db, ownerId, { taskId, limit: 1 } as never);
      expect(p1.data).toHaveLength(1);
      expect(p1.nextCursor).not.toBeNull();
      const p2 = await svc.listComments(db, ownerId, {
        taskId,
        limit: 1,
        cursor: p1.nextCursor!,
      } as never);
      expect(p2.data).toHaveLength(1);
    });

    it('non-member rejected', async () => {
      await expect(
        svc.listComments(db, outsiderId, { taskId, limit: 10 } as never),
      ).rejects.toThrow(BadRequestError);
    });

    it('missing task (404)', async () => {
      await expect(
        svc.listComments(db, ownerId, { taskId: 'missing', limit: 10 } as never),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('createComment', () => {
    it('happy path creates comment', async () => {
      const c = await svc.createComment(db, ownerId, { taskId, content: 'first' });
      expect(c.content).toBe('first');
      expect(c.authorId).toBe(ownerId);
    });

    it('mention by name triggers notification', async () => {
      await svc.createComment(db, ownerId, { taskId, content: 'hi @bob' });
      const notifications = await prisma.notification.findMany({ where: { userId: memberId } });
      expect(notifications.length).toBeGreaterThan(0);
    });

    it('self-mention does not create notification', async () => {
      await svc.createComment(db, ownerId, { taskId, content: 'note @alice' });
      const notifications = await prisma.notification.findMany({ where: { userId: ownerId } });
      expect(notifications).toHaveLength(0);
    });

    it('non-member rejected (400)', async () => {
      await expect(svc.createComment(db, outsiderId, { taskId, content: 'nope' })).rejects.toThrow(
        BadRequestError,
      );
    });

    it('missing task (404)', async () => {
      await expect(
        svc.createComment(db, ownerId, { taskId: 'missing', content: 'x' }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateComment', () => {
    it('author can edit', async () => {
      const c = await svc.createComment(db, ownerId, { taskId, content: 'orig' });
      const updated = await svc.updateComment(db, ownerId, c.id, { content: 'edited' });
      expect(updated.content).toBe('edited');
      expect(updated.editedAt).not.toBeNull();
    });

    it('non-author rejected', async () => {
      const c = await svc.createComment(db, ownerId, { taskId, content: 'orig' });
      await expect(svc.updateComment(db, memberId, c.id, { content: 'hacked' })).rejects.toThrow(
        BadRequestError,
      );
    });

    it('missing (404)', async () => {
      await expect(svc.updateComment(db, ownerId, 'missing', { content: 'x' })).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe('deleteComment', () => {
    it('author can delete (soft)', async () => {
      const c = await svc.createComment(db, ownerId, { taskId, content: 'orig' });
      await svc.deleteComment(db, ownerId, c.id);
      const after = await prisma.comment.findUnique({ where: { id: c.id } });
      expect(after?.deletedAt).not.toBeNull();
    });

    it('non-author rejected', async () => {
      const c = await svc.createComment(db, ownerId, { taskId, content: 'orig' });
      await expect(svc.deleteComment(db, memberId, c.id)).rejects.toThrow(BadRequestError);
    });
  });
});
