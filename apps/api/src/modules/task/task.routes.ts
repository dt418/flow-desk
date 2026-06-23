import { Hono } from 'hono';
import {
  createTaskSchema,
  updateTaskSchema,
  moveTaskSchema,
  createDependencySchema,
  createSubtaskSchema,
  taskSchema,
} from '@flow-desk/shared/task';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth } from '../../shared/middleware/auth';
import { taskService, listTasksQuerySchema } from './task.service';

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
    return c.json({ data: z.array(taskSchema).parse(data), nextCursor });
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
  await taskService.deleteDependency(c.req.param('id')!);
  return c.json({ ok: true });
});