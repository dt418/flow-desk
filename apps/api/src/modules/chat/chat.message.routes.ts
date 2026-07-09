import { Hono } from 'hono';
import { prisma } from '../../shared/lib/prisma';
import { requireAuth } from '../../shared/middleware/auth';
import { zValidator } from '@hono/zod-validator';
import {
  createChatMessageSchema,
  updateChatMessageSchema,
  listChatMessagesQuerySchema,
  messageParamsSchema,
} from '@flow-desk/shared/chat';
import * as svc from './chat.message.service';
import { emitToRoom } from '../../shared/lib/socket-events';

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
    const { wid, channelId } = c.req.valid('param');
    const query = c.req.valid('query');
    const result = await svc.listMessages(prisma, auth.user.id, wid, channelId, query);
    return c.json({ data: result.data, nextCursor: result.nextCursor });
  },
);

chatMessageRouter.post(
  '/',
  zValidator('param', messageParamsSchema.pick({ wid: true, channelId: true })),
  async (c) => {
    const auth = c.get('auth');
    const { wid, channelId } = c.req.valid('param');
    const parsed = createChatMessageSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ code: 'INVALID_BODY', details: parsed.error.flatten() }, 400);
    }
    const message = await svc.sendMessage(prisma, auth.user.id, wid, channelId, parsed.data);
    // Broadcast to all viewers in the room. The REST caller has no socket
    // identity to exclude, so everyone (including any of the author's other
    // tabs) gets the realtime event.
    emitToRoom('/collab', `conversation:${channelId}`, 'message:new', {
      channelId,
      message: {
        id: message.id,
        channelId: message.channelId,
        authorId: message.authorId,
        content: message.content,
        mentionedUserIds: message.mentionedUserIds,
        clientMessageId: message.clientMessageId,
        createdAt: message.createdAt.toISOString(),
        updatedAt: message.updatedAt.toISOString(),
        editedAt: null,
        author: {
          id: message.author.id,
          name: message.author.name,
          email: message.author.email,
          avatarUrl: message.author.avatarUrl,
        },
      },
    });
    return c.json({ data: message }, 201);
  },
);

chatMessageRouter.patch('/:messageId', zValidator('param', messageParamsSchema), async (c) => {
  const auth = c.get('auth');
  const { wid, channelId, messageId } = c.req.valid('param');
  const parsed = updateChatMessageSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ code: 'INVALID_BODY', details: parsed.error.flatten() }, 400);
  }
  const message = await svc.updateMessage(
    prisma,
    auth.user.id,
    wid,
    channelId,
    messageId,
    parsed.data,
  );
  return c.json({ data: message });
});

chatMessageRouter.delete('/:messageId', zValidator('param', messageParamsSchema), async (c) => {
  const auth = c.get('auth');
  const { wid, channelId, messageId } = c.req.valid('param');
  await svc.deleteMessage(prisma, auth.user.id, wid, channelId, messageId);
  return c.json({ ok: true });
});
