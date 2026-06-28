import { Hono } from 'hono';
import { prisma } from '../../shared/lib/prisma';
import { requireAuth } from '../../shared/middleware/auth';
import { zValidator } from '@hono/zod-validator';
import { createChannelSchema, updateChannelSchema, channelParamSchema, listChannelsQuerySchema } from './chat.schema';
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

chatRouter.post(
  '/',
  zValidator('param', channelParamSchema.pick({ wid: true })),
  async (c) => {
    const auth = c.get('auth');
    const { wid } = c.req.valid('param');
    const body = createChannelSchema.parse(await c.req.json());
    const channel = await svc.createChannel(prisma, auth.user.id, wid, body);
    return c.json({ data: channel }, 201);
  },
);

chatRouter.patch(
  '/:id',
  zValidator('param', channelParamSchema),
  async (c) => {
    const auth = c.get('auth');
    const { wid, id } = c.req.valid('param');
    const body = updateChannelSchema.parse(await c.req.json());
    const channel = await svc.updateChannel(prisma, auth.user.id, wid, id, body);
    return c.json({ data: channel });
  },
);

chatRouter.delete(
  '/:id',
  zValidator('param', channelParamSchema),
  async (c) => {
    const auth = c.get('auth');
    const { wid, id } = c.req.valid('param');
    await svc.deleteChannel(prisma, auth.user.id, wid, id);
    return c.json({ ok: true });
  },
);

chatRouter.onError((err, c) => {
  throw err;
});
