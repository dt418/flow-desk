import { Hono } from 'hono';
import { z } from 'zod';
import {
  createCommentSchema,
  updateCommentSchema,
  listCommentsQuerySchema,
} from '@flow-desk/shared/comment';
import { zValidator } from '@hono/zod-validator';
import { prisma } from '../../shared/lib/prisma';
import { requireAuth } from '../../shared/middleware/auth';
import * as svc from './comment.service';

export const commentRouter = new Hono();
commentRouter.use('*', requireAuth());

const isChatQuery = z.object({
  chat: z.coerce.boolean().optional(),
});

commentRouter.get(
  '/',
  zValidator('query', listCommentsQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json({ code: 'INVALID_QUERY', details: result.error.flatten() }, 400);
    }
    return undefined;
  }),
  async (c) => {
    const auth = c.get('auth');
    const query = c.req.valid('query');
    const rawQuery = c.req.query('chat');
    const chatFilter = rawQuery === 'true' ? true : rawQuery === 'false' ? false : undefined;
    const result = await svc.listComments(prisma, auth.user.id, query, chatFilter);
    return c.json({ data: result.data, nextCursor: result.nextCursor });
  },
);

commentRouter.post('/', async (c) => {
  const auth = c.get('auth');
  const body = createCommentSchema
    .extend({
      isChat: z.boolean().optional(),
    })
    .parse(await c.req.json());
  const comment = await svc.createComment(prisma, auth.user.id, body);
  return c.json({ comment }, 201);
});

commentRouter.patch('/:id', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id')!;
  const body = updateCommentSchema.parse(await c.req.json());
  const comment = await svc.updateComment(prisma, auth.user.id, id, body);
  return c.json({ comment });
});

commentRouter.delete('/:id', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id')!;
  await svc.deleteComment(prisma, auth.user.id, id);
  return c.json({ ok: true });
});
