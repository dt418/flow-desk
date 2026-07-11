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
import { taskService, listTasksQuerySchema, exportTasksQuerySchema } from './task.service';
import { serializeTaskCsvRow } from './task-csv';
import { prisma } from '../../shared/lib/prisma';
import { assertMembership } from '../../shared/lib/access';
import * as commentSvc from '../comment/comment.service';
import { activityService } from '../activity';
import { NotFoundError } from '../../shared/errors';
import * as chatSvc from '../chat/chat.service';

export const taskRouter = new Hono();
taskRouter.use('*', requireAuth());

/** Map Prisma's `labelsDeprecated` field to the API-facing `labels` field. */
function mapLabels<T extends Record<string, unknown> | null>(
  task: T,
): T extends null ? null : Omit<NonNullable<T>, 'labelsDeprecated'> & { labels: string[] } {
  if (task === null) return null as never;
  const { labelsDeprecated, ...rest } = task as T & { labelsDeprecated?: string[] };
  return { ...rest, labels: labelsDeprecated ?? [] } as never;
}

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
  return c.json({ task: mapLabels(await taskService.create(auth.user.id, body)) }, 201);
});

taskRouter.get(
  '/export',
  zValidator('query', exportTasksQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json({ code: 'INVALID_QUERY', details: result.error.flatten() }, 400);
    }
    return undefined;
  }),
  async (c) => {
    const auth = c.get('auth');
    const query = c.req.valid('query');
    const rows = await taskService.exportTasks(query, auth.user.id);

    // Filename: tasks-{slug}-{yyyyMMddHHmm}.{ext} (slug fallback to workspaceId)
    const ws = await prisma.workspace.findUnique({
      where: { id: query.workspaceId },
      select: { slug: true, name: true },
    });
    const slug = ws?.slug ?? query.workspaceId;
    const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
    const format = query.format ?? 'csv';

    const mapExportRows = (list: typeof rows) =>
      list.map((r) => ({
        status: r.status,
        title: r.title,
        assigneeEmail: r.assignee?.email ?? '',
        priority: r.priority,
        dueDate: r.dueDate ? r.dueDate.toISOString() : '',
        labels: r.assignments.map((a) => a.label.name).join(';'),
      }));

    if (format === 'excel' || format === 'xlsx') {
      const { buildExcelWorkbook } = await import('../export/export-workbook');
      const body = buildExcelWorkbook(mapExportRows(rows));
      const filename = `tasks-${slug}-${stamp}.xlsx.csv`;
      c.header('Content-Type', 'text/csv; charset=utf-8');
      c.header('Content-Disposition', `attachment; filename="${filename}"`);
      return c.body(body);
    }

    if (format === 'pdf') {
      const { buildPdfTaskReport } = await import('../export/export-workbook');
      const body = buildPdfTaskReport({
        workspaceName: ws?.name ?? slug,
        tasks: mapExportRows(rows),
      });
      const filename = `tasks-${slug}-${stamp}.pdf.txt`;
      c.header('Content-Type', 'text/plain; charset=utf-8');
      c.header('Content-Disposition', `attachment; filename="${filename}"`);
      return c.body(body);
    }

    const filename = `tasks-${slug}-${stamp}.csv`;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // UTF-8 BOM so Excel opens UTF-8 non-ASCII correctly
        controller.enqueue(encoder.encode('\uFEFF'));
        controller.enqueue(
          encoder.encode('Status,Title,Assignee Email,Priority,Due Date,Labels\r\n'),
        );
        for (const row of rows) {
          controller.enqueue(encoder.encode(serializeTaskCsvRow(row)));
        }
        controller.close();
      },
    });

    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="${filename}"`);
    return c.body(stream);
  },
);

taskRouter.get('/:id', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');
  return c.json({ task: mapLabels(await taskService.get(auth.user.id, id)) });
});

taskRouter.patch('/:id', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');
  const body = updateTaskSchema.parse(await c.req.json());
  return c.json({ task: mapLabels(await taskService.update(auth.user.id, id, body)) });
});

taskRouter.get('/:id/chat', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');
  const task = await taskService.get(auth.user.id, id);
  await assertMembership(task.workspaceId, auth.user.id);
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50'), 100);
  const chatQuery = { taskId: id, limit, cursor: c.req.query('cursor') ?? undefined };
  const chatResult = await commentSvc.listComments(prisma, auth.user.id, chatQuery, true);
  return c.json({ data: chatResult.data, nextCursor: chatResult.nextCursor });
});

taskRouter.post('/:id/task-channel', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');
  const task = await taskService.get(auth.user.id, id);
  const channel = await chatSvc.getOrCreateTaskChannel(prisma, task.workspaceId, id);
  return c.json({ data: channel });
});

taskRouter.get('/:id/activity', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');
  const cursor = c.req.query('cursor') ?? undefined;
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20'), 100);
  const result = await activityService.list(auth.user.id, id, { cursor, limit });
  return c.json({ data: result.data, nextCursor: result.nextCursor });
});

taskRouter.delete('/:id', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');
  await taskService.delete(auth.user.id, id);
  return c.json({ ok: true });
});

taskRouter.post('/:id/move', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');
  const body = moveTaskSchema.parse(await c.req.json());
  return c.json({ task: mapLabels(await taskService.move(auth.user.id, id, body)) });
});

taskRouter.post('/:id/restore', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');
  return c.json({ task: mapLabels(await taskService.restore(auth.user.id, id)) });
});

taskRouter.post('/:id/subtasks', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');
  const body = createSubtaskSchema.parse(await c.req.json());
  return c.json({ task: mapLabels(await taskService.createSubtask(auth.user.id, id, body)) }, 201);
});

taskRouter.post('/dependencies', async (c) => {
  const auth = c.get('auth');
  const body = createDependencySchema.parse(await c.req.json());
  return c.json({ dependency: await taskService.createDependency(auth.user.id, body) }, 201);
});

taskRouter.delete('/dependencies/:id', async (c) => {
  const auth = c.get('auth');
  const depId = c.req.param('id');
  const dep = await prisma.taskDependency.findUnique({
    where: { id: depId },
    select: { blockingTask: { select: { id: true, workspaceId: true, deletedAt: true } } },
  });
  if (!dep || !dep.blockingTask || dep.blockingTask.deletedAt) {
    throw new NotFoundError('Task dependency');
  }
  await assertMembership(dep.blockingTask.workspaceId, auth.user.id);
  await taskService.deleteDependency(auth.user.id, depId);
  return c.json({ ok: true });
});
