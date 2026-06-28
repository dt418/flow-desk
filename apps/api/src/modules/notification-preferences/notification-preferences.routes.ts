import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { prisma } from '../../shared/lib/prisma';
import { requireAuth, requireWorkspaceRole } from '../../shared/middleware/auth';
import { assertMembership } from '../../shared/lib/access';
import * as svc from './notification-preferences.service';
import {
  updateWorkspaceNotificationSettingSchema,
  updateUserNotificationPreferenceSchema,
} from '@flow-desk/shared/notification-preferences';
import { workspaceParamSchema } from './notification-preferences.schema';

export const prefsRouter = new Hono();
prefsRouter.use('*', requireAuth());

prefsRouter.get('/:workspaceId/settings', async (c) => {
  const auth = c.get('auth');
  const { workspaceId } = workspaceParamSchema.parse(c.req.param());
  await assertMembership(workspaceId, auth.user.id);
  const setting = await svc.getOrCreateWorkspaceSetting(prisma, workspaceId);
  return c.json({ data: setting });
});

prefsRouter.patch(
  '/:workspaceId/settings',
  requireWorkspaceRole(['OWNER', 'ADMIN']),
  zValidator('json', updateWorkspaceNotificationSettingSchema, (result, c) => {
    if (!result.success)
      return c.json({ code: 'INVALID_BODY', details: result.error.flatten() }, 400);
    return undefined;
  }),
  async (c) => {
    const { workspaceId } = workspaceParamSchema.parse(c.req.param());
    const body = c.req.valid('json');
    const setting = await svc.updateWorkspaceSetting(prisma, workspaceId, body);
    return c.json({ data: setting });
  },
);

prefsRouter.get('/', async (c) => {
  const auth = c.get('auth');
  const workspaceId = c.req.query('workspaceId');
  if (workspaceId) {
    await assertMembership(workspaceId, auth.user.id);
    const effective = await svc.getEffectivePreferences(prisma, auth.user.id, workspaceId);
    const current = await svc.getUserPreference(prisma, auth.user.id, workspaceId);
    return c.json({ data: { effective, current } });
  }
  const effective = await svc.getEffectivePreferences(prisma, auth.user.id, '');
  return c.json({ data: { effective, current: null } });
});

prefsRouter.patch(
  '/',
  zValidator('json', updateUserNotificationPreferenceSchema, (result, c) => {
    if (!result.success)
      return c.json({ code: 'INVALID_BODY', details: result.error.flatten() }, 400);
    return undefined;
  }),
  async (c) => {
    const auth = c.get('auth');
    const body = c.req.valid('json');
    if (body.workspaceId) {
      await assertMembership(body.workspaceId, auth.user.id);
    }
    const pref = await svc.upsertUserPreference(prisma, auth.user.id, body);
    return c.json({ data: pref });
  },
);
