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
import * as svc from '../../src/modules/notification/notification.service';
import { prisma as db } from '../../src/shared/lib/prisma';

describe('notification.service', () => {
  let prisma: ReturnType<typeof getTestPrisma>;
  let userId: string;

  beforeEach(async () => {
    prisma = getTestPrisma();
    await cleanDatabase(prisma);
    const u = await createUser(prisma, 'u@test.com');
    userId = u.id;
    await prisma.notification.createMany({
      data: [
        { userId, type: 'TASK_ASSIGNED', title: 't1', body: 'b' },
        { userId, type: 'TASK_ASSIGNED', title: 't2', body: 'b' },
        { userId, type: 'TASK_DUE_SOON', title: 't3', body: 'b' },
      ],
    });
  });

  describe('listNotifications', () => {
    it('lists all (cursor)', async () => {
      const res = await svc.listNotifications(db, userId, {
        limit: 10,
        unreadOnly: false,
      } as never);
      expect(res.data).toHaveLength(3);
      expect(res.unreadCount).toBe(3);
    });

    it('filters unread only', async () => {
      await svc.markAllRead(db, userId);
      const res = await svc.listNotifications(db, userId, { limit: 10, unreadOnly: true } as never);
      expect(res.data).toHaveLength(0);
      expect(res.unreadCount).toBe(0);
    });

    it('cursor pagination', async () => {
      const p1 = await svc.listNotifications(db, userId, { limit: 1, unreadOnly: false } as never);
      expect(p1.data).toHaveLength(1);
      expect(p1.nextCursor).not.toBeNull();
      const p2 = await svc.listNotifications(db, userId, {
        limit: 1,
        cursor: p1.nextCursor!,
        unreadOnly: false,
      } as never);
      expect(p2.data).toHaveLength(1);
    });

    it('isolation: other user notifications not visible', async () => {
      const other = await createUser(prisma, 'other@test.com');
      const res = await svc.listNotifications(db, other.id, {
        limit: 10,
        unreadOnly: false,
      } as never);
      expect(res.data).toHaveLength(0);
    });
  });

  describe('markRead', () => {
    it('marks given ids', async () => {
      const all = await prisma.notification.findMany({ where: { userId } });
      const ids = all.slice(0, 2).map((n) => n.id);
      const res = await svc.markRead(db, userId, { ids });
      expect(res.updated).toBe(2);
      const unread = await prisma.notification.count({ where: { userId, readAt: null } });
      expect(unread).toBe(1);
    });

    it('no double-mark', async () => {
      const all = await prisma.notification.findMany({ where: { userId } });
      const ids = [all[0]!.id];
      await svc.markRead(db, userId, { ids });
      const res = await svc.markRead(db, userId, { ids });
      expect(res.updated).toBe(0);
    });
  });

  describe('markAllRead', () => {
    it('marks all', async () => {
      const res = await svc.markAllRead(db, userId);
      expect(res.updated).toBe(3);
      const unread = await prisma.notification.count({ where: { userId, readAt: null } });
      expect(unread).toBe(0);
    });

    it('only affects own notifications', async () => {
      const other = await createUser(prisma, 'other@test.com');
      await prisma.notification.create({
        data: { userId: other.id, type: 'TASK_ASSIGNED', title: 'x', body: 'y' },
      });
      await svc.markAllRead(db, userId);
      const otherUnread = await prisma.notification.count({
        where: { userId: other.id, readAt: null },
      });
      expect(otherUnread).toBe(1);
    });
  });
});
