import { prisma } from '../../shared/lib/prisma';
import { decodeCursor, encodeCursor, CursorPaginationQuery } from '@flow-desk/shared/pagination';
import { cuidSchema } from '@flow-desk/shared/common';
import { assertMembership } from '../../shared/lib/access';
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
import { emitToTask, emitToWorkspace, emitToUser, safeEmit } from '../../shared/lib/socket-events';
import { logger } from '../../shared/lib/logger';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors';
import * as repo from './task.repository';
import { activityService } from '../activity';
import { createTaskAssignmentNotification } from '../notification/notification.service';
import { handleTaskAssignedEmail } from '../notification/notification-email.service';

export const listTasksQuerySchema = CursorPaginationQuery.extend({
  workspaceId: cuidSchema,
  columnId: cuidSchema.optional(),
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

type TaskStatusLike = TaskStatus;

export const taskService = {
  async list(query: ListTasksQuery, userId: string) {
    await assertMembership(query.workspaceId, userId);

    const where: Prisma.TaskWhereInput = {
      workspaceId: query.workspaceId,
      ...(query.columnId ? { columnId: query.columnId } : {}),
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

  async create(userId: string, body: CreateTaskInput) {
    await assertMembership(body.workspaceId, userId);
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
      createdById: userId,
      parentTaskId: body.parentTaskId ?? null,
      position: body.position ?? (last ? last.position + 1 : 0),
    });
    safeEmit(() => emitToWorkspace(task.workspaceId, 'task:created', { task }), {
      event: 'task:created',
      taskId: task.id,
    });
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
    await assertMembership(existing.workspaceId, userId);

    if (body.version !== undefined && body.version !== existing.version) {
      throw new ConflictError('Task was updated by another user', { current: existing });
    }

    const previousAssigneeId = existing.assigneeId;

    const task = await repo.update(prisma, id, {
      ...body,
      ...(body.dueDate ? { dueDate: new Date(body.dueDate) } : {}),
      version: { increment: 1 },
    });
    safeEmit(() => emitToWorkspace(task.workspaceId, 'task:updated', { task }), {
      event: 'task:updated',
      taskId: task.id,
    });
    safeEmit(() => emitToTask(task.id, 'task:updated', { task }), {
      event: 'task:updated',
      taskId: task.id,
    });
    await recordUpdateDiff(userId, existing, task);
    await handleAssigneeChange(userId, previousAssigneeId, task);
    return task;
  },

  async delete(userId: string, id: string) {
    const existing = await repo.findActiveById(prisma, id);
    if (!existing) throw new NotFoundError('Task not found');
    await assertMembership(existing.workspaceId, userId);
    await repo.softDelete(prisma, id);
    safeEmit(() => emitToWorkspace(existing.workspaceId, 'task:deleted', { taskId: id }), {
      event: 'task:deleted',
      taskId: id,
    });
    safeEmit(() => emitToTask(id, 'task:deleted', { taskId: id }), {
      event: 'task:deleted',
      taskId: id,
    });
  },

  async restore(userId: string, id: string) {
    const existing = await repo.findActiveById(prisma, id);
    if (!existing) throw new NotFoundError('Task not found');
    await assertMembership(existing.workspaceId, userId);
    const task = await prisma.task.update({
      where: { id },
      data: { deletedAt: null },
    });
    safeEmit(() => emitToWorkspace(existing.workspaceId, 'task:restored', { task }), {
      event: 'task:restored',
      taskId: id,
    });
    safeEmit(() => emitToTask(id, 'task:restored', { task }), {
      event: 'task:restored',
      taskId: id,
    });
    await activityService.record({ taskId: id, userId, action: 'RESTORED' });
    return task;
  },

  async move(userId: string, id: string, body: MoveTaskInput) {
    const existing = await repo.findActiveById(prisma, id);
    if (!existing) throw new NotFoundError('Task not found');
    await assertMembership(existing.workspaceId, userId);

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

      const finalStatus: TaskStatusLike = targetColumn.isDoneColumn ? 'DONE' : existing.status;
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

    safeEmit(() => emitToWorkspace(existing.workspaceId, 'task:moved', { task: movedTask }), {
      event: 'task:moved',
      taskId: id,
    });
    safeEmit(() => emitToTask(id, 'task:moved', { task: movedTask }), {
      event: 'task:moved',
      taskId: id,
    });
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
    await assertMembership(parent.workspaceId, userId);
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
    safeEmit(() => emitToWorkspace(parent.workspaceId, 'task:created', { task: subtask }), {
      event: 'task:created',
      taskId: subtask.id,
    });
    safeEmit(() => emitToTask(parent.id, 'task:subtask:created', { task: subtask }), {
      event: 'task:subtask:created',
      parentTaskId: parent.id,
    });
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
    await assertMembership(blocking.workspaceId, userId);

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
    safeEmit(
      () => emitToWorkspace(blocking.workspaceId, 'task:dependency:added', { dependency: dep }),
      { event: 'task:dependency:added', dependencyId: dep.id },
    );
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

async function recordUpdateDiff(
  userId: string,
  existing: {
    id: string;
    title: string;
    description: string | null;
    priority: string;
    status: string;
    columnId: string;
    assigneeId: string | null;
    dueDate: Date | null;
  },
  updated: {
    id: string;
    title: string;
    description: string | null;
    priority: string;
    status: string;
    columnId: string;
    assigneeId: string | null;
    dueDate: Date | null;
  },
) {
  const diffs: Array<{
    action:
      | 'TITLE_CHANGED'
      | 'DESCRIPTION_CHANGED'
      | 'STATUS_CHANGED'
      | 'PRIORITY_CHANGED'
      | 'COLUMN_CHANGED'
      | 'ASSIGNEE_CHANGED'
      | 'DUE_DATE_CHANGED';
    field: string;
    oldValue: string | null;
    newValue: string | null;
  }> = [];
  if (existing.title !== updated.title)
    diffs.push({
      action: 'TITLE_CHANGED',
      field: 'title',
      oldValue: existing.title,
      newValue: updated.title,
    });
  if ((existing.description ?? null) !== (updated.description ?? null))
    diffs.push({
      action: 'DESCRIPTION_CHANGED',
      field: 'description',
      oldValue: existing.description,
      newValue: updated.description,
    });
  if (existing.priority !== updated.priority)
    diffs.push({
      action: 'PRIORITY_CHANGED',
      field: 'priority',
      oldValue: existing.priority,
      newValue: updated.priority,
    });
  if (existing.status !== updated.status)
    diffs.push({
      action: 'STATUS_CHANGED',
      field: 'status',
      oldValue: existing.status,
      newValue: updated.status,
    });
  if (existing.columnId !== updated.columnId)
    diffs.push({
      action: 'COLUMN_CHANGED',
      field: 'columnId',
      oldValue: existing.columnId,
      newValue: updated.columnId,
    });
  if ((existing.assigneeId ?? null) !== (updated.assigneeId ?? null))
    diffs.push({
      action: 'ASSIGNEE_CHANGED',
      field: 'assigneeId',
      oldValue: existing.assigneeId,
      newValue: updated.assigneeId,
    });
  const oldDue = existing.dueDate?.toISOString() ?? null;
  const newDue = updated.dueDate?.toISOString() ?? null;
  if (oldDue !== newDue)
    diffs.push({
      action: 'DUE_DATE_CHANGED',
      field: 'dueDate',
      oldValue: oldDue,
      newValue: newDue,
    });
  for (const d of diffs) {
    await activityService.record({
      taskId: updated.id,
      userId,
      action: d.action,
      field: d.field,
      oldValue: d.oldValue,
      newValue: d.newValue,
    });
  }
}

async function handleAssigneeChange(
  userId: string,
  previousAssigneeId: string | null,
  task: {
    id: string;
    title: string;
    workspaceId: string;
    assigneeId: string | null;
    dueDate: Date | null;
  },
) {
  if (!previousAssigneeId && !task.assigneeId) return;
  if (previousAssigneeId === task.assigneeId) return;
  if (!task.assigneeId) return;

  const [workspace, assignee, assigner] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: task.workspaceId }, select: { name: true } }),
    prisma.user.findUnique({
      where: { id: task.assigneeId },
      select: { id: true, name: true, email: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
  ]);
  if (!workspace || !assignee || !assigner) return;

  try {
    const notification = await createTaskAssignmentNotification(prisma, {
      taskId: task.id,
      taskTitle: task.title,
      workspaceId: task.workspaceId,
      assigneeId: task.assigneeId,
      assignedById: userId,
      workspaceName: workspace.name,
    });
    safeEmit(() => emitToUser(task.assigneeId!, 'notification:new', { notification }), {
      event: 'notification:new',
      taskId: task.id,
    });
  } catch (err) {
    logger.warn({ err, taskId: task.id }, 'failed to create assignment notification');
  }

  try {
    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
    const dueAt = task.dueDate?.toISOString() ?? null;
    await handleTaskAssignedEmail(prisma, {
      assigneeId: task.assigneeId,
      assigneeName: assignee.name,
      assigneeEmail: assignee.email,
      assignerName: assigner.name,
      taskId: task.id,
      taskTitle: task.title,
      taskUrl: `${appUrl}/tasks/${task.id}`,
      workspaceId: task.workspaceId,
      workspaceName: workspace.name,
      dueAt,
    });
  } catch (err) {
    logger.warn({ err, taskId: task.id }, 'failed to enqueue assignment email');
  }
}
