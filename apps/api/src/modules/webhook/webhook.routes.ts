import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { requireAuth } from '../../shared/middleware/auth';
import { webhookService } from './webhook.service';
import { CursorPaginationQuery } from '@flow-desk/shared/pagination';
import {
  createWebhookSchema,
  updateWebhookSchema,
  webhookSchema,
  webhookWithSecretSchema,
  webhookListResponseSchema,
  webhookDeliverySchema,
} from '@flow-desk/shared/webhook';

export const webhookRouter = new Hono();
webhookRouter.use('*', requireAuth());

// POST / — Admin+
webhookRouter.post(
  '/',
  zValidator('json', createWebhookSchema, (result, c) => {
    if (!result.success)
      return c.json({ code: 'INVALID_BODY', details: result.error.flatten() }, 400);
    return undefined;
  }),
  async (c) => {
    const wid = c.req.param('wid')!;
    const auth = c.get('auth');
    const body = c.req.valid('json');
    const result = await webhookService.create(auth.user.id, wid, body);
    return c.json(webhookWithSecretSchema.parse(result), 201);
  },
);

// GET / — Member+
webhookRouter.get('/', async (c) => {
  const wid = c.req.param('wid')!;
  const auth = c.get('auth');
  const result = await webhookService.list(auth.user.id, wid);
  return c.json(webhookListResponseSchema.parse({ data: result }));
});

// GET /:id — Member+
webhookRouter.get('/:id', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');
  const result = await webhookService.get(auth.user.id, id);
  return c.json(webhookSchema.parse(result));
});

// PATCH /:id — Admin+
webhookRouter.patch(
  '/:id',
  zValidator('json', updateWebhookSchema, (result, c) => {
    if (!result.success)
      return c.json({ code: 'INVALID_BODY', details: result.error.flatten() }, 400);
    return undefined;
  }),
  async (c) => {
    const auth = c.get('auth');
    const id = c.req.param('id');
    const body = c.req.valid('json');
    const result = await webhookService.update(auth.user.id, id, body);
    return c.json(webhookSchema.parse(result));
  },
);

// DELETE /:id — Admin+
webhookRouter.delete('/:id', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');
  await webhookService.remove(auth.user.id, id);
  return c.json({ ok: true });
});

// GET /:id/deliveries — Member+
webhookRouter.get(
  '/:id/deliveries',
  zValidator('query', CursorPaginationQuery, (result, c) => {
    if (!result.success)
      return c.json({ code: 'INVALID_QUERY', details: result.error.flatten() }, 400);
    return undefined;
  }),
  async (c) => {
    const auth = c.get('auth');
    const id = c.req.param('id');
    const query = c.req.valid('query');
    const result = await webhookService.listDeliveries(auth.user.id, id, query);
    const deliveries = result.data.map((d) => ({
      ...d,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
      deliveredAt: d.deliveredAt?.toISOString() ?? null,
    }));
    return c.json({
      data: deliveries.map((d) => webhookDeliverySchema.parse(d)),
      nextCursor: result.nextCursor,
    });
  },
);
