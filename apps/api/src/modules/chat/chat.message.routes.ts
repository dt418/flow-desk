import { Hono } from 'hono';
import { prisma } from '../../shared/lib/prisma';
import { requireAuth } from '../../shared/middleware/auth';
import { zValidator } from '@hono/zod-validator';
import {
  createChatMessageSchema,
  updateChatMessageSchema,
  listChatMessagesQuerySchema,
  messageParamsSchema,
} from './chat.message.schema';
import * as svc from './chat.message.service';

export const chatMessageRouter = new Hono();
chatMessageRouter.use('*', requireAuth());

chatMessageRouter.get(
  '/',
  zValidator('param', messageParamsSchema.pick({ wid: true, channelId: true })),
  zValidator('query', listChatMessagesQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json({ code: 'INVALID_QUERY', details: result.error.flatten() }, 400);
    }
    return undefined;
  }),
  async (c) => {
    const auth = c.get('auth');
    const { channelId } = c.req.valid('param');
    const query = c.req.valid('query');
    const result = await svc.listMessages(prisma, auth.user.id, channelId, query);
    return c.json({ data: result.data, nextCursor: result.nextCursor });
  },
);

chatMessageRouter.post(
  '/',
  zValidator('param', messageParamsSchema.pick({ wid: true, channelId: true })),
  async (c) => {
    const auth = c.get('auth');
    const { channelId } = c.req.valid('param');
    const body = createChatMessageSchema.parse(await c.req.json());
    const message = await svc.sendMessage(prisma, auth.user.id, channelId, body);
    return c.json({ data: message }, 201);
  },
);

chatMessageRouter.patch(
  '/:messageId',
  zValidator('param', messageParamsSchema),
  async (c) => {
    const auth = c.get('auth');
    const { channelId, messageId } = c.req.valid('param');
    const body = updateChatMessageSchema.parse(await c.req.json());
    const message = await svc.updateMessage(prisma, auth.user.id, channelId, messageId, body);
    return c.json({ data: message });
  },
);

chatMessageRouter.delete(
  '/:messageId',
  zValidator('param', messageParamsSchema),
  async (c) => {
    const auth = c.get('auth');
    const { channelId, messageId } = c.req.valid('param');
    await svc.deleteMessage(prisma, auth.user.id, channelId, messageId);
    return c.json({ ok: true });
  },
);
