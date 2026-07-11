import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { requireAuth } from '../../shared/middleware/auth';
import { sprintService } from './sprint.service';
import {
  createSprintSchema,
  updateSprintSchema,
  sprintSchema,
  burndownPointSchema,
} from '@flow-desk/shared/sprint';
import { z } from 'zod';

export const sprintRouter = new Hono();
sprintRouter.use('*', requireAuth());

sprintRouter.get('/', async (c) => {
  const wid = c.req.param('wid')!;
  const auth = c.get('auth');
  const data = await sprintService.list(auth.user.id, wid);
  return c.json({ data: data.map((s) => sprintSchema.parse(s)) });
});

sprintRouter.get('/backlog', async (c) => {
  const wid = c.req.param('wid')!;
  const auth = c.get('auth');
  const data = await sprintService.backlog(auth.user.id, wid);
  return c.json({ data });
});

sprintRouter.post(
  '/',
  zValidator('json', createSprintSchema, (result, c) => {
    if (!result.success)
      return c.json({ code: 'INVALID_BODY', details: result.error.flatten() }, 400);
    return undefined;
  }),
  async (c) => {
    const wid = c.req.param('wid')!;
    const auth = c.get('auth');
    const result = await sprintService.create(auth.user.id, wid, c.req.valid('json'));
    return c.json(sprintSchema.parse(result), 201);
  },
);

sprintRouter.patch(
  '/:id',
  zValidator('json', updateSprintSchema, (result, c) => {
    if (!result.success)
      return c.json({ code: 'INVALID_BODY', details: result.error.flatten() }, 400);
    return undefined;
  }),
  async (c) => {
    const auth = c.get('auth');
    const result = await sprintService.update(auth.user.id, c.req.param('id'), c.req.valid('json'));
    return c.json(sprintSchema.parse(result));
  },
);

sprintRouter.delete('/:id', async (c) => {
  const auth = c.get('auth');
  await sprintService.remove(auth.user.id, c.req.param('id'));
  return c.json({ ok: true });
});

sprintRouter.post(
  '/:id/tasks',
  zValidator('json', z.object({ taskId: z.string().min(1) }), (result, c) => {
    if (!result.success)
      return c.json({ code: 'INVALID_BODY', details: result.error.flatten() }, 400);
    return undefined;
  }),
  async (c) => {
    const auth = c.get('auth');
    const body = c.req.valid('json');
    await sprintService.assignTask(auth.user.id, c.req.param('id'), body.taskId);
    return c.json({ ok: true });
  },
);

sprintRouter.delete('/:id/tasks/:taskId', async (c) => {
  const auth = c.get('auth');
  await sprintService.unassignTask(auth.user.id, c.req.param('id'), c.req.param('taskId'));
  return c.json({ ok: true });
});

sprintRouter.get('/:id/burndown', async (c) => {
  const auth = c.get('auth');
  const data = await sprintService.burndown(auth.user.id, c.req.param('id'));
  return c.json({ data: data.map((p) => burndownPointSchema.parse(p)) });
});
