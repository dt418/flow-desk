import { Hono } from 'hono';
import { listNotificationsQuerySchema, markReadSchema } from '@flow-desk/shared/notification';
import { prisma } from '../../shared/lib/prisma';
import { requireAuth } from '../../shared/middleware/auth';

export const notificationRouter = new Hono();
notificationRouter.use('*', requireAuth());

notificationRouter.get('/', async (c) => {
  const auth = c.get('auth');
  const query = listNotificationsQuerySchema.parse(c.req.query());
  const where = {
    userId: auth.user.id,
    ...(query.unreadOnly ? { readAt: null } : {}),
  };
  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: auth.user.id, readAt: null } }),
  ]);
  return c.json({ notifications, total, unreadCount });
});

notificationRouter.patch('/read', async (c) => {
  const auth = c.get('auth');
  const body = markReadSchema.parse(await c.req.json());
  const result = await prisma.notification.updateMany({
    where: { id: { in: body.ids }, userId: auth.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  return c.json({ updated: result.count });
});

notificationRouter.post('/read-all', async (c) => {
  const auth = c.get('auth');
  const result = await prisma.notification.updateMany({
    where: { userId: auth.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  return c.json({ updated: result.count });
});
