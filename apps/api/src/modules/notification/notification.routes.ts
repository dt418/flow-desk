import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { listNotificationsQuerySchema, markReadSchema } from '@flow-desk/shared/notification';
import { prisma } from '../../shared/lib/prisma';
import { requireAuth } from '../../shared/middleware/auth';
import * as svc from './notification.service';

export const notificationRouter = new Hono();
notificationRouter.use('*', requireAuth());

notificationRouter.get(
  '/',
  zValidator('query', listNotificationsQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json({ code: 'INVALID_QUERY', details: result.error.flatten() }, 400);
    }
    return undefined;
  }),
  async (c) => {
    const auth = c.get('auth');
    const query = c.req.valid('query');
    const result = await svc.listNotifications(prisma, auth.user.id, query);
    return c.json({
      data: result.data,
      nextCursor: result.nextCursor,
      unreadCount: result.unreadCount,
    });
  },
);

notificationRouter.patch('/read', async (c) => {
  const auth = c.get('auth');
  const body = markReadSchema.parse(await c.req.json());
  return c.json(await svc.markRead(prisma, auth.user.id, body));
});

notificationRouter.post('/read-all', async (c) => {
  const auth = c.get('auth');
  return c.json(await svc.markAllRead(prisma, auth.user.id));
});
