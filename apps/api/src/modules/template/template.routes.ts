import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { requireAuth } from '../../shared/middleware/auth';
import { templateService } from './template.service';
import {
  createTemplateSchema,
  updateTemplateSchema,
  applyTemplateSchema,
  createRecurringSchema,
  taskTemplateSchema,
} from '@flow-desk/shared/template';

export const templateRouter = new Hono();
templateRouter.use('*', requireAuth());

templateRouter.get('/', async (c) => {
  const wid = c.req.param('wid')!;
  const auth = c.get('auth');
  const data = await templateService.list(auth.user.id, wid);
  return c.json({ data: data.map((t) => taskTemplateSchema.parse(t)) });
});

templateRouter.post(
  '/',
  zValidator('json', createTemplateSchema, (result, c) => {
    if (!result.success)
      return c.json({ code: 'INVALID_BODY', details: result.error.flatten() }, 400);
    return undefined;
  }),
  async (c) => {
    const wid = c.req.param('wid')!;
    const auth = c.get('auth');
    const result = await templateService.create(auth.user.id, wid, c.req.valid('json'));
    return c.json(taskTemplateSchema.parse(result), 201);
  },
);

templateRouter.patch(
  '/:id',
  zValidator('json', updateTemplateSchema, (result, c) => {
    if (!result.success)
      return c.json({ code: 'INVALID_BODY', details: result.error.flatten() }, 400);
    return undefined;
  }),
  async (c) => {
    const auth = c.get('auth');
    const result = await templateService.update(
      auth.user.id,
      c.req.param('id'),
      c.req.valid('json'),
    );
    return c.json(taskTemplateSchema.parse(result));
  },
);

templateRouter.post(
  '/:id/apply',
  zValidator('json', applyTemplateSchema, (result, c) => {
    if (!result.success)
      return c.json({ code: 'INVALID_BODY', details: result.error.flatten() }, 400);
    return undefined;
  }),
  async (c) => {
    const auth = c.get('auth');
    const result = await templateService.apply(
      auth.user.id,
      c.req.param('id'),
      c.req.valid('json'),
    );
    return c.json(result, 201);
  },
);

templateRouter.delete('/:id', async (c) => {
  const auth = c.get('auth');
  await templateService.remove(auth.user.id, c.req.param('id'));
  return c.json({ ok: true });
});

templateRouter.get('/recurring', async (c) => {
  const wid = c.req.param('wid')!;
  const auth = c.get('auth');
  const data = await templateService.listRecurring(auth.user.id, wid);
  return c.json({ data });
});

templateRouter.post(
  '/recurring',
  zValidator('json', createRecurringSchema, (result, c) => {
    if (!result.success)
      return c.json({ code: 'INVALID_BODY', details: result.error.flatten() }, 400);
    return undefined;
  }),
  async (c) => {
    const wid = c.req.param('wid')!;
    const auth = c.get('auth');
    const result = await templateService.createRecurring(auth.user.id, wid, c.req.valid('json'));
    return c.json(result, 201);
  },
);

templateRouter.delete('/recurring/:id', async (c) => {
  const auth = c.get('auth');
  await templateService.removeRecurring(auth.user.id, c.req.param('id'));
  return c.json({ ok: true });
});
