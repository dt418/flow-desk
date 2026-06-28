import { Hono } from 'hono';
import {
  createTaskSchema,
  updateTaskSchema,
  moveTaskSchema,
  createDependencySchema,
  createSubtaskSchema,
  taskWithRelationsSchema,
} from '@flow-desk/shared/task';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth } from '../../shared/middleware/auth';
import { taskService, listTasksQuerySchema } from './task.service';
import { prisma } from '../../shared/lib/prisma';
import { assertMembership } from '../../shared/lib/access';
import * as commentSvc from '../comment/comment.service';
import { NotFoundError } from '../../shared/errors';

export const taskRouter = new Hono();
taskRouter.use('*', requireAuth());

taskRouter.get(
  '/',
  zValidator('query', listTasksQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json({ code: 'INVALID_QUERY', details: result.error.flatten() }, 400);
    }
    return undefined;
  }),
  async (c) => {
    const auth = c.get('auth');
    const query = c.req.valid('query');
    const { data, nextCursor } = await taskService.list(query, auth.user.id);
    const apiTasks = data.map((t) => ({
      ...t,
      labels: (t as unknown as { labelsDeprecated?: string[] }).labelsDeprecated ?? [],
    }));
    return c.json({ data: z.array(taskWithRelationsSchema).parse(apiTasks), nextCursor });
  },
);

taskRouter.post('/', async (c) => {
  const auth = c.get('auth');
  const body = createTaskSchema.parse(await c.req.json());
  return c.json({ task: await taskService.create(auth.user.id, body) }, 201);
});

taskRouter.get('/:id', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id')!;
  return c.json({ task: await taskService.get(auth.user.id, id) });
});

taskRouter.patch('/:id', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id')!;
  const body = updateTaskSchema.parse(await c.req.json());
  return c.json({ task: await taskService.update(auth.user.id, id, body) });
});

taskRouter.get('/:id/chat', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id')!;
  const task = await taskService.get(auth.user.id, id);
  await assertMembership(task.workspaceId, auth.user.id);
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50'), 100);
  const chatQuery = { taskId: id, limit, cursor: c.req.query('cursor') ?? undefined };
  const chatResult = await commentSvc.listComments(prisma, auth.user.id, chatQuery as any, true);
  return c.json({ data: chatResult.data, nextCursor: chatResult.nextCursor });
});

taskRouter.delete('/:id', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id')!;
  await taskService.delete(auth.user.id, id);
  return c.json({ ok: true });
});

taskRouter.post('/:id/move', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id')!;
  const body = moveTaskSchema.parse(await c.req.json());
  return c.json({ task: await taskService.move(auth.user.id, id, body) });
});

taskRouter.post('/:id/restore', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id')!;
  return c.json({ task: await taskService.restore(auth.user.id, id) });
});

taskRouter.post('/:id/subtasks', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id')!;
  const body = createSubtaskSchema.parse(await c.req.json());
  return c.json({ task: await taskService.createSubtask(auth.user.id, id, body) }, 201);
});

taskRouter.post('/dependencies', async (c) => {
  const auth = c.get('auth');
  const body = createDependencySchema.parse(await c.req.json());
  return c.json({ dependency: await taskService.createDependency(auth.user.id, body) }, 201);
});

taskRouter.delete('/dependencies/:id', async (c) => {
  const auth = c.get('auth');
  const depId = c.req.param('id')!;
  const dep = await prisma.taskDependency.findUnique({
    where: { id: depId },
    select: { blockingTask: { select: { id: true, workspaceId: true, deletedAt: true } } },
  });
  if (!dep || !dep.blockingTask || dep.blockingTask.deletedAt) {
    throw new NotFoundError('Task dependency');
  }
  await assertMembership(dep.blockingTask.workspaceId, auth.user.id);
  await taskService.deleteDependency(depId);
  return c.json({ ok: true });
});
