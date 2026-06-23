import { prisma } from '../../shared/lib/prisma';
import { decodeCursor, encodeCursor, CursorPaginationQuery } from '@flow-desk/shared/pagination';
import { cuidSchema } from '@flow-desk/shared/common';
import { assertMembership } from '../../shared/lib/access';
import type { Prisma, TaskStatus, TaskPriority } from '../../../generated/prisma/client';
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
import { logger } from '../../shared/lib/logger';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors';
import * as repo from './task.repository';

export const listTasksQuerySchema = CursorPaginationQuery.extend({
  workspaceId: cuidSchema,
  columnId: cuidSchema.optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assigneeId: cuidSchema.optional(),
  search: z.string().max(200).optional(),
  dueBefore: z.string().datetime({ offset: true }).optional(),
  dueAfter: z.string().datetime({ offset: true }).optional(),
});
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;

function safeEmit(fn: () => void, ctx: Record<string, unknown>): void {
  try {
    fn();
  } catch (err) {
    logger.warn({ err, ...ctx }, 'socket emit failed');
  }
}

type TaskStatusLike = TaskStatus;

export const taskService = {
  async list(query: ListTasksQuery, userId: string) {
    await assertMembership(query.workspaceId, userId);

    const where: Prisma.TaskWhereInput = {
      workspaceId: query.workspaceId,
      ...(query.columnId ? { columnId: query.columnId } : {}),
      ...(query.status ? { status: query.status as TaskStatus } : {}),
      ...(query.priority ? { priority: query.priority as TaskPriority } : {}),
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

    const order: 'asc' | 'desc' = 'desc';
    const decoded = query.cursor ? decodeCursor(query.cursor) : null;
    const cursorWhere: Prisma.TaskWhereInput | undefined = decoded
      ? {
          AND: [
            where,
            {
              OR: [
                { createdAt: { lt: decoded.createdAt } },
                { createdAt: decoded.createdAt, id: { lt: decoded.id } },
              ],
            },
          ],
        }
      : undefined;

    const items = await prisma.task.findMany({
      where: cursorWhere ?? where,
      orderBy: [{ createdAt: order }, { id: order }],
      take: query.limit + 1,
      include: {
        assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });
    const hasMore = items.length > query.limit;
    const data = hasMore ? items.slice(0, query.limit) : items;
    const last = data[data.length - 1];
    const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;
    return { data, nextCursor };
  },

  async create(userId: string, body: CreateTaskInput) {
    await assertMembership(body.workspaceId, userId);
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
            await tx.task.update({ where: { id: t.id }, data: { columnId: sourceColumnId, position: i } });
          }
          i++;
        }
      } else {
        let si = 0;
        for (const t of sourceNew) {
          await tx.task.update({ where: { id: t.id }, data: { columnId: sourceColumnId, position: si } });
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
            await tx.task.update({ where: { id: t.id }, data: { columnId: body.columnId, position: ti } });
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
    return movedTask;
  },

  async createSubtask(userId: string, parentId: string, body: CreateSubtaskInput) {
    const parent = await repo.findActiveById(prisma, parentId);
    if (!parent) throw new NotFoundError('Parent task not found');
    await assertMembership(parent.workspaceId, userId);

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
    return dep;
  },

  async deleteDependency(id: string) {
    await repo.deleteDependency(prisma, id);
  },
};