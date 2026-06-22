import { Hono } from 'hono';
import {
  createTaskSchema,
  updateTaskSchema,
  listTasksQuerySchema,
  moveTaskSchema,
  createDependencySchema,
  createSubtaskSchema,
} from '@flow-desk/shared/task';
import { prisma } from '../../shared/lib/prisma';
import { requireAuth } from '../../shared/middleware/auth';
import { NotFoundError, BadRequestError, ConflictError } from '../../shared/errors';

export const taskRouter = new Hono();
taskRouter.use('*', requireAuth());

async function assertMembership(workspaceId: string, userId: string) {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!member) throw new BadRequestError('Not a member of this workspace');
  return member;
}

taskRouter.get('/', async (c) => {
  const auth = c.get('auth');
  const query = listTasksQuerySchema.parse(c.req.query());
  await assertMembership(query.workspaceId, auth.user.id);

  const where = {
    workspaceId: query.workspaceId,
    deletedAt: null,
    ...(query.columnId ? { columnId: query.columnId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.priority ? { priority: query.priority } : {}),
    ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
    ...(query.search ? { title: { contains: query.search, mode: 'insensitive' as const } } : {}),
    ...(query.dueBefore || query.dueAfter
      ? {
          dueDate: {
            ...(query.dueBefore ? { lte: new Date(query.dueBefore) } : {}),
            ...(query.dueAfter ? { gte: new Date(query.dueAfter) } : {}),
          },
        }
      : {}),
  };

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    }),
    prisma.task.count({ where }),
  ]);

  return c.json({ tasks, total, page: query.page, pageSize: query.pageSize });
});

taskRouter.post('/', async (c) => {
  const auth = c.get('auth');
  const body = createTaskSchema.parse(await c.req.json());
  await assertMembership(body.workspaceId, auth.user.id);

  const last = await prisma.task.findFirst({
    where: { columnId: body.columnId, deletedAt: null },
    orderBy: { position: 'desc' },
  });

  const task = await prisma.task.create({
    data: {
      workspaceId: body.workspaceId,
      columnId: body.columnId,
      title: body.title,
      description: body.description ?? null,
      priority: body.priority,
      status: body.status,
      assigneeId: body.assigneeId ?? null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      createdById: auth.user.id,
      parentTaskId: body.parentTaskId ?? null,
      position: body.position ?? (last ? last.position + 1 : 0),
      ...(body.labels ? { labels: { set: body.labels } } : {}),
    },
  });
  return c.json({ task }, 201);
});

taskRouter.get('/:id', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id')!;
  const task = await prisma.task.findFirst({
    where: { id, deletedAt: null },
    include: {
      assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
      createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
      subtasks: { where: { deletedAt: null }, orderBy: { position: 'asc' } },
      dependencies: true,
      blockers: true,
      _count: { select: { comments: { where: { deletedAt: null } }, attachments: true } },
    },
  });
  if (!task) throw new NotFoundError('Task not found');
  await assertMembership(task.workspaceId, auth.user.id);
  return c.json({ task });
});

taskRouter.patch('/:id', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id')!;
  const body = updateTaskSchema.parse(await c.req.json());
  const existing = await prisma.task.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError('Task not found');
  await assertMembership(existing.workspaceId, auth.user.id);

  if (body.version !== undefined && body.version !== existing.version) {
    throw new ConflictError('Task was updated by another user', {
      current: existing,
    });
  }

  const task = await prisma.task.update({
    where: { id },
    data: {
      ...body,
      ...(body.dueDate ? { dueDate: new Date(body.dueDate) } : {}),
      version: { increment: 1 },
    },
  });
  return c.json({ task });
});

taskRouter.delete('/:id', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id')!;
  const existing = await prisma.task.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError('Task not found');
  await assertMembership(existing.workspaceId, auth.user.id);
  await prisma.task.update({ where: { id }, data: { deletedAt: new Date() } });
  return c.json({ ok: true });
});

taskRouter.post('/:id/move', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id')!;
  const body = moveTaskSchema.parse(await c.req.json());
  const existing = await prisma.task.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError('Task not found');
  await assertMembership(existing.workspaceId, auth.user.id);

  if (body.version !== existing.version) {
    throw new ConflictError('Task was updated by another user', { current: existing });
  }

  const targetColumn = await prisma.column.findUnique({ where: { id: body.columnId } });
  if (!targetColumn || targetColumn.workspaceId !== existing.workspaceId) {
    throw new BadRequestError('Invalid target column');
  }

  const task = await prisma.task.update({
    where: { id },
    data: {
      columnId: body.columnId,
      position: body.position,
      status: targetColumn.isDoneColumn ? 'DONE' : existing.status,
      ...(targetColumn.isDoneColumn ? { completedAt: new Date() } : {}),
      version: { increment: 1 },
    },
  });
  return c.json({ task });
});

taskRouter.post('/:id/subtasks', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id')!;
  const parent = await prisma.task.findFirst({ where: { id, deletedAt: null } });
  if (!parent) throw new NotFoundError('Parent task not found');
  await assertMembership(parent.workspaceId, auth.user.id);

  const body = createSubtaskSchema.parse(await c.req.json());
  const subtask = await prisma.task.create({
    data: {
      workspaceId: parent.workspaceId,
      columnId: body.columnId,
      title: body.title,
      description: body.description ?? null,
      priority: body.priority,
      status: body.status,
      assigneeId: body.assigneeId ?? null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      createdById: auth.user.id,
      parentTaskId: parent.id,
      position: body.position ?? 0,
    },
  });
  return c.json({ task: subtask }, 201);
});

taskRouter.post('/dependencies', async (c) => {
  const auth = c.get('auth');
  const body = createDependencySchema.parse(await c.req.json());
  if (body.blockingTaskId === body.blockedTaskId) {
    throw new BadRequestError('A task cannot block itself');
  }

  const [blocking, blocked] = await Promise.all([
    prisma.task.findUnique({ where: { id: body.blockingTaskId } }),
    prisma.task.findUnique({ where: { id: body.blockedTaskId } }),
  ]);
  if (!blocking || !blocked) throw new NotFoundError('Task not found');
  if (blocking.workspaceId !== blocked.workspaceId) {
    throw new BadRequestError('Tasks must be in same workspace');
  }
  await assertMembership(blocking.workspaceId, auth.user.id);

  const existing = await prisma.taskDependency.findFirst({
    where: { blockingTaskId: body.blockingTaskId, blockedTaskId: body.blockedTaskId },
  });
  if (existing) throw new ConflictError('Dependency already exists');

  // Cycle detection via BFS
  const visited = new Set<string>();
  const queue: string[] = [body.blockingTaskId];
  while (queue.length) {
    const current = queue.shift()!;
    if (current === body.blockedTaskId) {
      throw new BadRequestError('Dependency would create a cycle');
    }
    if (visited.has(current)) continue;
    visited.add(current);
    const deps = await prisma.taskDependency.findMany({
      where: { blockedTaskId: current },
      select: { blockingTaskId: true },
    });
    for (const d of deps) queue.push(d.blockingTaskId);
  }

  const dep = await prisma.taskDependency.create({
    data: { blockingTaskId: body.blockingTaskId, blockedTaskId: body.blockedTaskId },
  });
  return c.json({ dependency: dep }, 201);
});

taskRouter.delete('/dependencies/:id', async (c) => {
  const id = c.req.param('id')!;
  await prisma.taskDependency.delete({ where: { id } });
  return c.json({ ok: true });
});
