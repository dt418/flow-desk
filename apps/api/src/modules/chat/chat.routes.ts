import { Hono } from 'hono';
import { prisma } from '../../shared/lib/prisma';
import { requireAuth } from '../../shared/middleware/auth';
import { zValidator } from '@hono/zod-validator';
import {
  createChannelSchema,
  updateChannelSchema,
  channelParamSchema,
  listChannelsQuerySchema,
} from '@flow-desk/shared/chat';
import { cuidSchema } from '@flow-desk/shared/common';
import * as svc from './chat.service';

export const chatRouter = new Hono();
chatRouter.use('*', requireAuth());

chatRouter.get(
  '/',
  zValidator('param', channelParamSchema.pick({ wid: true })),
  zValidator('query', listChannelsQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json({ code: 'INVALID_QUERY', details: result.error.flatten() }, 400);
    }
    return undefined;
  }),
  async (c) => {
    const auth = c.get('auth');
    const { wid } = c.req.valid('param');
    const channels = await svc.listChannels(prisma, auth.user.id, wid);
    return c.json({ data: channels });
  },
);

chatRouter.get(
  '/:id',
  zValidator('param', channelParamSchema, (result, c) => {
    if (!result.success) {
      return c.json({ code: 'INVALID_PARAMS', details: result.error.flatten() }, 400);
    }
    return undefined;
  }),
  async (c) => {
    const auth = c.get('auth');
    const { wid, id } = c.req.valid('param');
    const channel = await svc.getChannel(prisma, auth.user.id, wid, id);
    return c.json({ data: channel });
  },
);

chatRouter.post('/', zValidator('param', channelParamSchema.pick({ wid: true })), async (c) => {
  const auth = c.get('auth');
  const { wid } = c.req.valid('param');
  const parsed = createChannelSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ code: 'INVALID_BODY', details: parsed.error.flatten() }, 400);
  }
  const channel = await svc.createChannel(prisma, auth.user.id, wid, parsed.data);
  return c.json({ data: channel }, 201);
});

chatRouter.patch('/:id', zValidator('param', channelParamSchema), async (c) => {
  const auth = c.get('auth');
  const { wid, id } = c.req.valid('param');
  const parsed = updateChannelSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ code: 'INVALID_BODY', details: parsed.error.flatten() }, 400);
  }
  const channel = await svc.updateChannel(prisma, auth.user.id, wid, id, parsed.data);
  return c.json({ data: channel });
});

chatRouter.delete('/:id', zValidator('param', channelParamSchema), async (c) => {
  const auth = c.get('auth');
  const { wid, id } = c.req.valid('param');
  await svc.deleteChannel(prisma, auth.user.id, wid, id);
  return c.json({ ok: true });
});

chatRouter.get('/:id/members', zValidator('param', channelParamSchema), async (c) => {
  const auth = c.get('auth');
  const { wid, id } = c.req.valid('param');
  const members = await svc.listChannelMembers(prisma, auth.user.id, wid, id);
  return c.json({ data: members });
});

chatRouter.post('/:id/members', zValidator('param', channelParamSchema), async (c) => {
  const auth = c.get('auth');
  const { wid, id } = c.req.valid('param');
  const body = (await c.req.json().catch(() => null)) as { userId?: string } | null;
  if (!body?.userId || typeof body.userId !== 'string') {
    return c.json({ code: 'INVALID_BODY', message: 'userId required' }, 400);
  }
  const result = await svc.addChannelMember(prisma, auth.user.id, wid, id, body.userId);
  return c.json(result, 201);
});

chatRouter.delete(
  '/:id/members/:userId',
  zValidator('param', channelParamSchema.extend({ userId: cuidSchema })),
  async (c) => {
    const auth = c.get('auth');
    const { wid, id, userId: targetUserId } = c.req.valid('param');
    await svc.removeChannelMember(prisma, auth.user.id, wid, id, targetUserId);
    return c.json({ ok: true });
  },
);

chatRouter.onError((err, _c) => {
  throw err;
});
