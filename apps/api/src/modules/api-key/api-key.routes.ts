import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { createApiKeySchema } from '@flow-desk/shared/api-key';
import { requireAuth } from '../../shared/middleware/auth';
import { apiKeyService } from './api-key.service';
import { prisma } from '../../shared/lib/prisma';
import { rateLimit } from '../../shared/middleware/rate-limit';
import { UnauthorizedError } from '../../shared/errors';
import { createMiddleware } from 'hono/factory';

export const apiKeyRouter = new Hono();
apiKeyRouter.use('*', requireAuth());

apiKeyRouter.get('/', async (c) => {
  const auth = c.get('auth');
  const data = await apiKeyService.list(auth.user.id);
  return c.json({ data });
});

apiKeyRouter.post(
  '/',
  zValidator('json', createApiKeySchema, (result, c) => {
    if (!result.success)
      return c.json({ code: 'INVALID_BODY', details: result.error.flatten() }, 400);
    return undefined;
  }),
  async (c) => {
    const auth = c.get('auth');
    const body = c.req.valid('json');
    const result = await apiKeyService.create(auth.user.id, body.name, body.scopes);
    return c.json(result, 201);
  },
);

apiKeyRouter.delete('/:id', async (c) => {
  const auth = c.get('auth');
  await apiKeyService.revoke(auth.user.id, c.req.param('id'));
  return c.json({ ok: true });
});

type ApiKeyAuth = { userId: string; scopes: string[]; keyId: string };

/** Public v1 read API authenticated via Bearer fdkey_… */
export const publicV1Router = new Hono<{
  Variables: { apiKeyAuth: ApiKeyAuth };
}>();

publicV1Router.use('*', rateLimit({ scope: 'api-key', windowSec: 60, max: 100, keyBy: 'ip' }));

const requireApiKey = createMiddleware<{ Variables: { apiKeyAuth: ApiKeyAuth } }>(
  async (c, next) => {
    const header = c.req.header('authorization') ?? '';
    const m = header.match(/^Bearer\s+(fdkey_.+)$/i);
    if (!m) throw new UnauthorizedError('Missing API key');
    const auth = await apiKeyService.authenticate(m[1]!);
    c.set('apiKeyAuth', auth);
    await next();
  },
);

publicV1Router.use('*', requireApiKey);

publicV1Router.get('/workspaces', async (c) => {
  const auth = c.get('apiKeyAuth');
  if (!auth.scopes.includes('read') && !auth.scopes.includes('*')) {
    throw new UnauthorizedError('Insufficient scope');
  }
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: auth.userId },
    include: { workspace: true },
  });
  return c.json({
    data: memberships
      .filter((m) => !m.workspace.deletedAt)
      .map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        slug: m.workspace.slug,
        role: m.role,
      })),
  });
});

publicV1Router.get('/workspaces/:wid/tasks', async (c) => {
  const auth = c.get('apiKeyAuth');
  if (!auth.scopes.includes('read') && !auth.scopes.includes('*')) {
    throw new UnauthorizedError('Insufficient scope');
  }
  const wid = c.req.param('wid');
  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId: wid, userId: auth.userId },
  });
  if (!member) throw new UnauthorizedError('Not a workspace member');
  const tasks = await prisma.task.findMany({
    where: { workspaceId: wid, deletedAt: null },
    take: 100,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      assigneeId: true,
    },
  });
  return c.json({
    data: tasks.map((t) => ({
      ...t,
      dueDate: t.dueDate?.toISOString() ?? null,
    })),
  });
});
