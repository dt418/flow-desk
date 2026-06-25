import { Hono } from 'hono';
import { prisma } from '../../shared/lib/prisma';
import { requireAuth } from '../../shared/middleware/auth';
import { rateLimit } from '../../shared/middleware/rate-limit';
import {
  suggestAssignee,
  autoSchedule,
  suggestAssigneeSchema,
  autoScheduleSchema,
} from './ai.service';

export const aiRouter = new Hono();
aiRouter.use('*', requireAuth());
aiRouter.use('*', rateLimit({ scope: 'ai', windowSec: 60, max: 5, keyBy: 'user' }));

aiRouter.post('/suggest-assignee', async (c) => {
  const auth = c.get('auth');
  const body = suggestAssigneeSchema.parse(await c.req.json());
  return c.json(await suggestAssignee(prisma, auth.user.id, body));
});

aiRouter.post('/auto-schedule', async (c) => {
  const auth = c.get('auth');
  const body = autoScheduleSchema.parse(await c.req.json());
  return c.json(await autoSchedule(prisma, auth.user.id, body));
});
