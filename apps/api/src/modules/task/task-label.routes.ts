import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth } from '../../shared/middleware/auth';
import { rateLimit } from '../../shared/middleware/rate-limit';
import { RATE_LIMITS } from '../../shared/lib/rate-limit-policies';
import { taskLabelService } from './task-label.service';

const Param = z.object({ wid: z.string().cuid(), tid: z.string().cuid() });
const AssignBody = z.object({ labelId: z.string().cuid() });

export const taskLabelRouter = new Hono()
  .use('*', requireAuth())
  .get(
    '/',
    rateLimit({ ...RATE_LIMITS.LABEL_LIST, keyBy: 'user', scope: 'task-labels:list' }),
    zValidator('param', Param),
    async (c) => {
      const { wid, tid } = c.req.valid('param');
      const auth = c.get('auth');
      return c.json({ data: await taskLabelService.listForTask(wid, tid, auth.user.id) });
    },
  )
  .post(
    '/',
    rateLimit({ ...RATE_LIMITS.LABEL_ASSIGN, keyBy: 'user', scope: 'task-labels:assign' }),
    zValidator('param', Param),
    zValidator('json', AssignBody),
    async (c) => {
      const { wid, tid } = c.req.valid('param');
      const { labelId } = c.req.valid('json');
      const auth = c.get('auth');
      return c.json(await taskLabelService.assign(wid, tid, labelId, auth.user.id));
    },
  )
  .delete(
    '/:labelId',
    rateLimit({ ...RATE_LIMITS.LABEL_ASSIGN, keyBy: 'user', scope: 'task-labels:assign' }),
    zValidator('param', Param.extend({ labelId: z.string().cuid() })),
    async (c) => {
      const { wid, tid, labelId } = c.req.valid('param');
      const auth = c.get('auth');
      return c.json(await taskLabelService.unassign(wid, tid, labelId, auth.user.id));
    },
  );
