import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  createSavedFilterSchema,
  updateSavedFilterSchema,
  savedFilterListResponseSchema,
  savedFilterSchema,
} from '@flow-desk/shared/saved-filter';
import { requireAuth } from '../../shared/middleware/auth';
import { prisma } from '../../shared/lib/prisma';
import { savedFilterService } from './saved-filter.service';

export const savedFilterRouter = new Hono();
savedFilterRouter.use('*', requireAuth());

savedFilterRouter.get('/', async (c) => {
  const wid = c.req.param('wid')!;
  const auth = c.get('auth');
  const result = await savedFilterService.list(prisma, auth.user.id, wid);
  return c.json(savedFilterListResponseSchema.parse(result));
});

savedFilterRouter.post(
  '/',
  zValidator('json', createSavedFilterSchema, (result, c) => {
    if (!result.success) {
      return c.json({ code: 'INVALID_BODY', details: result.error.flatten() }, 400);
    }
    return undefined;
  }),
  async (c) => {
    const wid = c.req.param('wid')!;
    const auth = c.get('auth');
    const body = c.req.valid('json');
    const result = await savedFilterService.create(prisma, auth.user.id, wid, body);
    return c.json(savedFilterSchema.parse(result), 201);
  },
);

savedFilterRouter.patch(
  '/:id',
  zValidator('json', updateSavedFilterSchema, (result, c) => {
    if (!result.success) {
      return c.json({ code: 'INVALID_BODY', details: result.error.flatten() }, 400);
    }
    return undefined;
  }),
  async (c) => {
    const wid = c.req.param('wid')!;
    const id = c.req.param('id')!;
    const auth = c.get('auth');
    const body = c.req.valid('json');
    const result = await savedFilterService.update(prisma, auth.user.id, wid, id, body);
    return c.json(savedFilterSchema.parse(result));
  },
);

savedFilterRouter.delete('/:id', async (c) => {
  const wid = c.req.param('wid')!;
  const id = c.req.param('id')!;
  const auth = c.get('auth');
  const result = await savedFilterService.remove(prisma, auth.user.id, wid, id);
  return c.json(result);
});
