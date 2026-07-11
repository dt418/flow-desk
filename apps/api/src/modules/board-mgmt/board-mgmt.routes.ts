import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { requireAuth } from '../../shared/middleware/auth';
import { boardMgmtService } from './board-mgmt.service';

export const boardMgmtRouter = new Hono();
boardMgmtRouter.use('*', requireAuth());

boardMgmtRouter.get('/', async (c) => {
  const wid = c.req.param('wid')!;
  const auth = c.get('auth');
  const data = await boardMgmtService.list(auth.user.id, wid);
  return c.json({ data });
});

boardMgmtRouter.post(
  '/',
  zValidator('json', z.object({ name: z.string().min(1).max(120) }), (result, c) => {
    if (!result.success)
      return c.json({ code: 'INVALID_BODY', details: result.error.flatten() }, 400);
    return undefined;
  }),
  async (c) => {
    const wid = c.req.param('wid')!;
    const auth = c.get('auth');
    const body = c.req.valid('json');
    const result = await boardMgmtService.create(auth.user.id, wid, body.name);
    return c.json(result, 201);
  },
);

boardMgmtRouter.delete('/:id', async (c) => {
  const auth = c.get('auth');
  await boardMgmtService.remove(auth.user.id, c.req.param('id'));
  return c.json({ ok: true });
});
