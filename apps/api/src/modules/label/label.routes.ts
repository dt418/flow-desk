import { Hono } from 'hono';
import { createLabelSchema, updateLabelSchema } from '@flow-desk/shared';
import { prisma } from '../../shared/lib/prisma';
import { requireAuth } from '../../shared/middleware/auth';
import { rateLimit } from '../../shared/middleware/rate-limit';
import { RATE_LIMITS } from '../../shared/lib/rate-limit-policies';
import * as svc from './label.service';
import { getWorkspaceLabelsCache, setWorkspaceLabelsCache, clearWorkspaceLabelsCache } from './label.cache';

export const labelRouter = new Hono();
labelRouter.use('*', requireAuth());

labelRouter.get('/', rateLimit({ ...RATE_LIMITS.LABEL_LIST, keyBy: 'user', scope: 'labels:list' }), async (c) => {
  const wid = c.req.param('wid')!;
  const auth = c.get('auth');
  const cached = await getWorkspaceLabelsCache(wid);
  if (cached) {
    c.header('X-Cache', 'HIT');
    return c.json(JSON.parse(cached));
  }
  const labels = await svc.listLabels(prisma, auth.user.id, wid);
  const payload = { labels };
  await setWorkspaceLabelsCache(wid, JSON.stringify(payload));
  c.header('X-Cache', 'MISS');
  return c.json(payload);
});

labelRouter.post('/', rateLimit({ ...RATE_LIMITS.LABEL_WRITE, keyBy: 'user', scope: 'labels:write' }), async (c) => {
  const wid = c.req.param('wid')!;
  const auth = c.get('auth');
  const body = createLabelSchema.parse(await c.req.json());
  const label = await svc.createLabel(prisma, auth.user.id, wid, body);
  await clearWorkspaceLabelsCache(wid);
  return c.json({ label }, 201);
});

labelRouter.patch('/:labelId', rateLimit({ ...RATE_LIMITS.LABEL_WRITE, keyBy: 'user', scope: 'labels:write' }), async (c) => {
  const wid = c.req.param('wid')!;
  const labelId = c.req.param('labelId')!;
  const auth = c.get('auth');
  const body = updateLabelSchema.parse(await c.req.json());
  const label = await svc.updateLabel(prisma, auth.user.id, wid, labelId, body);
  return c.json({ label });
});

labelRouter.delete('/:labelId', rateLimit({ ...RATE_LIMITS.LABEL_WRITE, keyBy: 'user', scope: 'labels:write' }), async (c) => {
  const wid = c.req.param('wid')!;
  const labelId = c.req.param('labelId')!;
  const auth = c.get('auth');
  await svc.deleteLabel(prisma, auth.user.id, wid, labelId);
  return c.json({ ok: true });
});
