import { prisma } from '../../shared/lib/prisma';
import { decodeCursor, encodeCursor, CursorPaginationQuery } from '@flow-desk/shared/pagination';
import { cuidSchema } from '@flow-desk/shared/common';
import { assertCanWriteWorkspace, assertMembership } from '../../shared/lib/access';
import type { Prisma, TaskStatus } from '@flowdesk/db';
import { z } from 'zod';
import {
  taskStatusSchema,
  taskPrioritySchema,
  type CreateTaskInput,
  type UpdateTaskInput,
  type MoveTaskInput,
  type CreateSubtaskInput,
  type CreateDependencyInput,
} from '@flow-desk/shared/task';
import { emitToTask, emitToWorkspace } from '../../shared/lib/socket-events';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  PayloadTooLargeError,
} from '../../shared/errors';
import * as repo from './task.repository';
import { recordUpdateDiff } from '../activity/activity-diff';
import { handleAssigneeChange } from './task-assignee';
import { activityService } from '../activity';

export const listTasksQuerySchema = CursorPaginationQuery.extend({
  workspaceId: cuidSchema,
  columnId: cuidSchema.optional(),
  boardId: cuidSchema.optional(),
  sprintId: cuidSchema.optional(),
  type: z.enum(['TASK', 'EPIC', 'STORY', 'SUBTASK']).optional(),
  parentTaskId: cuidSchema.optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assigneeId: cuidSchema.optional(),
  search: z.string().max(200).optional(),
  dueBefore: z.string().datetime({ offset: true }).optional(),
  dueAfter: z.string().datetime({ offset: true }).optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'dueDate', 'priority', 'position']).default('position'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;

// Export accepts the same filter shape as list, minus cursor pagination.
// sortBy/sortOrder are kept (serializer ignores them) so both endpoints
// accept one shape and cannot drift.
export const exportTasksQuerySchema = listTasksQuerySchema
  .omit({
    cursor: true,
    limit: true,
  })
  .extend({
    format: z.enum(['csv', 'excel', 'xlsx', 'pdf']).default('csv'),
  });
export type ExportTasksQuery = z.infer<typeof exportTasksQuerySchema>;

/** Filter fields shared by list + export (format is export-only). */
type TaskFilterQuery = Omit<ExportTasksQuery, 'format'> & { format?: ExportTasksQuery['format'] };

// Shared filter builder for list + export — one filter path, no drift.
function buildTaskWhere(query: TaskFilterQuery): Prisma.TaskWhereInput {
  return {
    workspaceId: query.workspaceId,
    ...(query.columnId ? { columnId: query.columnId } : {}),
    // P4-2: optional board partition (exact boardId when provided)
    ...(query.boardId ? { boardId: query.boardId } : {}),
    ...(query.sprintId ? { sprintId: query.sprintId } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.parentTaskId ? { parentTaskId: query.parentTaskId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.priority ? { priority: query.priority } : {}),
    ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
    ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
    ...(query.dueBefore || query.dueAfter
      ? {
          dueDate: {
            ...(query.dueBefore ? { lte: new Date(query.dueBefore) } : {}),
            ...(query.dueAfter ? { gte: new Date(query.dueAfter) } : {}),
          },
        }
      : {}),
  };
}

// RFC 4180: wrap in quotes + double embedded quotes iff field has , " \r \n
export const taskService = {
  async list(query: ListTasksQuery, userId: string) {
    await assertMembership(query.workspaceId, userId);

    const where = buildTaskWhere(query);

    const order: 'asc' | 'desc' = query.sortOrder ?? 'asc';
    const primarySortField = query.sortBy ?? 'position';
    const decoded = query.cursor ? decodeCursor(query.cursor) : null;
    const dir = order === 'asc' ? 'gt' : 'lt';
    const PRIORITY_ORDER = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
    const cursorWhere: Prisma.TaskWhereInput | undefined = decoded
      ? {
          AND: [
            where,
            (() => {
              const sv = decoded.sortValue !== undefined ? decoded.sortValue : decoded.createdAt;
              if (sv === null) {
                return { [primarySortField]: null, id: { [dir]: decoded.id } } as const;
              }
              const or: Prisma.TaskWhereInput[] = [];
              if (primarySortField === 'priority') {
                const rank = PRIORITY_ORDER.indexOf(sv as (typeof PRIORITY_ORDER)[number]);
                if (rank >= 0) {
                  const subset =
                    order === 'asc'
                      ? PRIORITY_ORDER.slice(rank + 1)
                      : PRIORITY_ORDER.slice(0, rank);
                  if (subset.length > 0) or.push({ priority: { in: subset } });
                  or.push({ priority: sv, id: { [dir]: decoded.id } });
                }
              } else {
                or.push({ [primarySortField]: { [dir]: sv } });
                or.push({ [primarySortField]: sv, id: { [dir]: decoded.id } });
                if (primarySortField === 'dueDate' && order === 'asc') {
                  or.push({ [primarySortField]: null });
                }
              }
              return { OR: or } as const;
            })(),
          ],
        }
      : undefined;

    const items = await prisma.task.findMany({
      where: cursorWhere ?? where,
      orderBy: [{ [primarySortField]: order }, { id: order }],
      take: query.limit + 1,
      include: {
        assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });
    const hasMore = items.length > query.limit;
    const data = hasMore ? items.slice(0, query.limit) : items;
    const last = data[data.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor({
            sortValue: last[primarySortField],
            createdAt: last.createdAt,
            id: last.id,
          })
        : null;
    return { data, nextCursor };
  },

  async exportTasks(query: ExportTasksQuery, userId: string) {
    await assertMembership(query.workspaceId, userId);
    const where = buildTaskWhere(query);
    /** Hard cap so export cannot OOM large workspaces (async job is a future path). */
    const MAX_EXPORT_ROWS = 10_000;
    const rows = await prisma.task.findMany({
      where,
      include: {
        assignee: { select: { email: true } },
        assignments: { include: { label: { select: { name: true } } } },
      },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      take: MAX_EXPORT_ROWS + 1,
    });
    if (rows.length > MAX_EXPORT_ROWS) {
      throw new PayloadTooLargeError(
        `Export exceeds ${MAX_EXPORT_ROWS} rows. Narrow filters or export in batches.`,
        { code: 'EXPORT_TOO_LARGE', max: MAX_EXPORT_ROWS },
      );
    }
    return rows;
  },

  async create(userId: string, body: CreateTaskInput) {
    await assertCanWriteWorkspace(body.workspaceId, userId);
    if (body.columnId) {
      const column = await prisma.column.findUnique({
        where: { id: body.columnId },
        select: { workspaceId: true },
      });
      if (!column || column.workspaceId !== body.workspaceId) {
        throw new BadRequestError('Column does not belong to this workspace');
      }
    }
    const last = await repo.lastPositionInColumn(prisma, body.columnId);
    const task = await repo.create(prisma, {
      workspaceId: body.workspaceId,
      columnId: body.columnId,
      title: body.title,
      description: body.description ?? null,
      priority: body.priority,
      status: body.status,
      assigneeId: body.assigneeId ?? null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      startDate: body.startDate ? new Date(body.startDate) : null,
      color: body.color ?? null,
      createdById: userId,
      parentTaskId: body.parentTaskId ?? null,
      boardId: body.boardId ?? null,
      type: body.type ?? 'TASK',
      estimate: body.estimate ?? null,
      position: body.position ?? (last ? last.position + 1 : 0),
    });
    emitToWorkspace(task.workspaceId, 'task:created', { task });
    await activityService.record({
      taskId: task.id,
      userId,
      action: 'CREATED',
      newValue: task.title,
    });
    if (task.assigneeId && task.assigneeId !== userId) {
      await handleAssigneeChange(userId, null, task);
    }
    return task;
  },

  async get(userId: string, id: string) {
    const task = await repo.findActiveById(prisma, id, true);
    if (!task) throw new NotFoundError('Task not found');
    await assertMembership(task.workspaceId, userId);
    return task;
  },

  async update(userId: string, id: string, body: UpdateTaskInput) {
    const existing = await repo.findActiveById(prisma, id);
    if (!existing) throw new NotFoundError('Task not found');
    await assertCanWriteWorkspace(existing.workspaceId, userId);

    if (body.version !== undefined && body.version !== existing.version) {
      throw new ConflictError('Task was updated by another user', { current: existing });
    }

    const previousAssigneeId = existing.assigneeId;

    const rest = { ...body };
    delete rest.labels;
    const task = await repo.update(prisma, id, {
      ...rest,
      ...(body.dueDate !== undefined
        ? { dueDate: body.dueDate ? new Date(body.dueDate) : null }
        : {}),
      ...(body.startDate !== undefined
        ? { startDate: body.startDate ? new Date(body.startDate) : null }
        : {}),
      // P3-1: set completedAt when status moves to DONE for burndown
      ...(body.status === 'DONE' && existing.status !== 'DONE' ? { completedAt: new Date() } : {}),
      ...(body.status && body.status !== 'DONE' && existing.status === 'DONE'
        ? { completedAt: null }
        : {}),
      version: { increment: 1 },
    });
    emitToWorkspace(task.workspaceId, 'task:updated', { task });
    emitToTask(task.id, 'task:updated', { task });
    await recordUpdateDiff(userId, existing, task);
    await handleAssigneeChange(userId, previousAssigneeId, task);
    return task;
  },

  async delete(userId: string, id: string) {
    const existing = await repo.findActiveById(prisma, id);
    if (!existing) throw new NotFoundError('Task not found');
    await assertCanWriteWorkspace(existing.workspaceId, userId);
    await repo.softDelete(prisma, id);
    emitToWorkspace(existing.workspaceId, 'task:deleted', { taskId: id });
    emitToTask(id, 'task:deleted', { taskId: id });
  },

  async restore(userId: string, id: string) {
    const existing = await repo.findActiveById(prisma, id);
    if (!existing) throw new NotFoundError('Task not found');
    await assertCanWriteWorkspace(existing.workspaceId, userId);
    const task = await prisma.task.update({
      where: { id },
      data: { deletedAt: null },
    });
    emitToWorkspace(existing.workspaceId, 'task:restored', { task });
    emitToTask(id, 'task:restored', { task });
    await activityService.record({ taskId: id, userId, action: 'RESTORED' });
    return task;
  },

  async move(userId: string, id: string, body: MoveTaskInput) {
    const existing = await repo.findActiveById(prisma, id);
    if (!existing) throw new NotFoundError('Task not found');
    await assertCanWriteWorkspace(existing.workspaceId, userId);

    if (body.version !== existing.version) {
      throw new ConflictError('Task was updated by another user', { current: existing });
    }

    const targetColumn = await repo.findColumn(prisma, body.columnId);
    if (!targetColumn || targetColumn.workspaceId !== existing.workspaceId) {
      throw new BadRequestError('Invalid target column');
    }

    const sourceColumnId = existing.columnId;
    const isSameColumn = sourceColumnId === body.columnId;

    const [sourceTasks, targetTasks] = await Promise.all([
      repo.listColumnTaskIds(prisma, sourceColumnId),
      isSameColumn ? Promise.resolve([]) : repo.listColumnTaskIds(prisma, body.columnId),
    ]);

    const sourceNew = sourceTasks.filter((t) => t.id !== id);
    const targetBase = isSameColumn ? sourceNew : targetTasks.filter((t) => t.id !== id);
    const clampedPos = Math.max(0, Math.min(body.position, targetBase.length));
    const targetNew = [...targetBase];
    targetNew.splice(clampedPos, 0, { id });

    const movedTask = await prisma.$transaction(async (tx) => {
      const parkBase = 1_000_000;
      const parkIds: string[] = sourceNew.map((t) => t.id);
      if (!isSameColumn) {
        for (const t of targetTasks) if (t.id !== id) parkIds.push(t.id);
      }
      parkIds.push(id);

      for (let i = 0; i < parkIds.length; i++) {
        await tx.task.update({ where: { id: parkIds[i] }, data: { position: parkBase + i } });
      }

      const finalStatus: TaskStatus = targetColumn.isDoneColumn ? 'DONE' : existing.status;
      const completedAt = targetColumn.isDoneColumn ? new Date() : null;

      if (isSameColumn) {
        let i = 0;
        for (const t of targetNew) {
          if (t.id === id) {
            await tx.task.update({
              where: { id },
              data: {
                columnId: body.columnId,
                position: i,
                status: finalStatus,
                ...(completedAt ? { completedAt } : {}),
                version: { increment: 1 },
              },
            });
          } else {
            await tx.task.update({
              where: { id: t.id },
              data: { columnId: sourceColumnId, position: i },
            });
          }
          i++;
        }
      } else {
        let si = 0;
        for (const t of sourceNew) {
          await tx.task.update({
            where: { id: t.id },
            data: { columnId: sourceColumnId, position: si },
          });
          si++;
        }
        let ti = 0;
        for (const t of targetNew) {
          if (t.id === id) {
            await tx.task.update({
              where: { id },
              data: {
                columnId: body.columnId,
                position: ti,
                status: finalStatus,
                ...(completedAt ? { completedAt } : {}),
                version: { increment: 1 },
              },
            });
          } else {
            await tx.task.update({
              where: { id: t.id },
              data: { columnId: body.columnId, position: ti },
            });
          }
          ti++;
        }
      }
      return tx.task.findUnique({ where: { id } });
    });

    emitToWorkspace(existing.workspaceId, 'task:moved', { task: movedTask });
    emitToTask(id, 'task:moved', { task: movedTask });
    if (!isSameColumn) {
      await activityService.record({
        taskId: id,
        userId,
        action: 'COLUMN_CHANGED',
        field: 'columnId',
        oldValue: sourceColumnId,
        newValue: body.columnId,
      });
    }
    await activityService.record({
      taskId: id,
      userId,
      action: 'MOVED',
      field: 'position',
      metadata: { fromColumn: sourceColumnId, toColumn: body.columnId, position: body.position },
    });
    return movedTask;
  },

  async createSubtask(userId: string, parentId: string, body: CreateSubtaskInput) {
    const parent = await repo.findActiveById(prisma, parentId);
    if (!parent) throw new NotFoundError('Parent task not found');
    await assertCanWriteWorkspace(parent.workspaceId, userId);
    if (body.columnId) {
      const column = await prisma.column.findUnique({
        where: { id: body.columnId },
        select: { workspaceId: true },
      });
      if (!column || column.workspaceId !== parent.workspaceId) {
        throw new BadRequestError('Column does not belong to this workspace');
      }
    }

    const subtask = await repo.create(prisma, {
      workspaceId: parent.workspaceId,
      columnId: body.columnId,
      title: body.title,
      description: body.description ?? null,
      priority: body.priority,
      status: body.status,
      assigneeId: body.assigneeId ?? null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      createdById: userId,
      parentTaskId: parent.id,
      position: body.position ?? 0,
    });
    emitToWorkspace(parent.workspaceId, 'task:created', { task: subtask });
    emitToTask(parent.id, 'task:subtask:created', { task: subtask });
    await activityService.record({
      taskId: parent.id,
      userId,
      action: 'SUBTASK_CREATED',
      newValue: subtask.title,
      metadata: { subtaskId: subtask.id },
    });
    return subtask;
  },

  async createDependency(userId: string, body: CreateDependencyInput) {
    if (body.blockingTaskId === body.blockedTaskId) {
      throw new BadRequestError('A task cannot block itself');
    }

    const [blocking, blocked] = await Promise.all([
      repo.findActiveById(prisma, body.blockingTaskId),
      repo.findActiveById(prisma, body.blockedTaskId),
    ]);
    if (!blocking || !blocked) throw new NotFoundError('Task not found');
    if (blocking.workspaceId !== blocked.workspaceId) {
      throw new BadRequestError('Tasks must be in same workspace');
    }
    await assertCanWriteWorkspace(blocking.workspaceId, userId);

    const existing = await repo.findDependency(prisma, body.blockingTaskId, body.blockedTaskId);
    if (existing) throw new ConflictError('Dependency already exists');

    const visited = new Set<string>();
    const queue: string[] = [body.blockingTaskId];
    while (queue.length) {
      const current = queue.shift()!;
      if (current === body.blockedTaskId) {
        throw new BadRequestError('Dependency would create a cycle');
      }
      if (visited.has(current)) continue;
      visited.add(current);
      const deps = await repo.listBlockersOf(prisma, current);
      for (const d of deps) queue.push(d.blockingTaskId);
    }

    const dep = await repo.createDependency(prisma, {
      blockingTaskId: body.blockingTaskId,
      blockedTaskId: body.blockedTaskId,
    });
    emitToWorkspace(blocking.workspaceId, 'task:dependency:added', { dependency: dep });
    await activityService.record({
      taskId: body.blockedTaskId,
      userId,
      action: 'DEPENDENCY_CREATED',
      metadata: { dependencyId: dep.id, blockingTaskId: body.blockingTaskId },
    });
    return dep;
  },

  async deleteDependency(userId: string, id: string) {
    const dep = await repo.deleteDependency(prisma, id);
    await activityService.record({
      taskId: dep.blockedTaskId,
      userId,
      action: 'DEPENDENCY_DELETED',
      metadata: { dependencyId: id, blockingTaskId: dep.blockingTaskId },
    });
  },
};
