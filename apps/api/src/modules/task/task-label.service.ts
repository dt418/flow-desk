import { assertMembership } from '../../shared/lib/access';
import { emitToWorkspace } from '../../shared/lib/socket-events';
import { ConflictError, NotFoundError } from '../../shared/errors';
import { prisma } from '../../shared/lib/prisma';
import { clearWorkspaceLabelsCache } from '../label/label.cache';
import { taskLabelRepo } from './task-label.repository';

type LegacyLabelName = string;

export const taskLabelService = {
  async assign(workspaceId: string, taskId: string, labelId: string, userId: string) {
    await assertMembership(workspaceId, userId);
    const [task, label] = await Promise.all([
      prisma.task.findFirst({
        where: { id: taskId, deletedAt: null },
        select: { id: true, labelsDeprecated: true, workspaceId: true },
      }),
      prisma.taskLabel.findFirst({
        where: { id: labelId, deletedAt: null, workspaceId },
        select: { id: true, name: true, color: true },
      }),
    ]);
    if (!task || task.workspaceId !== workspaceId) throw new NotFoundError('Task not found');
    if (!label) throw new NotFoundError('Label not found');

    await prisma.$transaction(async (tx) => {
      await taskLabelRepo.assign(taskId, labelId);
      const current = (task.labelsDeprecated as LegacyLabelName[]) ?? [];
      if (!current.includes(label.name)) {
        await tx.task.update({
          where: { id: taskId },
          data: { labelsDeprecated: [...current, label.name] },
        });
      }
    });

    await clearWorkspaceLabelsCache(workspaceId);
    const payload = { taskId, labelId, action: 'assigned' as const, by: userId };
    emitToWorkspace(workspaceId, 'task:labels-changed', payload);
    return { ok: true };
  },

  async unassign(workspaceId: string, taskId: string, labelId: string, userId: string) {
    await assertMembership(workspaceId, userId);
    const [task, label] = await Promise.all([
      prisma.task.findFirst({
        where: { id: taskId, deletedAt: null },
        select: { id: true, labelsDeprecated: true, workspaceId: true },
      }),
      prisma.taskLabel.findFirst({ where: { id: labelId, workspaceId }, select: { name: true } }),
    ]);
    if (!task || task.workspaceId !== workspaceId) throw new NotFoundError('Task not found');
    if (!label) throw new ConflictError('Label not in this workspace');

    await prisma.$transaction(async (tx) => {
      await taskLabelRepo.unassign(taskId, labelId);
      const current = (task.labelsDeprecated as LegacyLabelName[]) ?? [];
      await tx.task.update({
        where: { id: taskId },
        data: { labelsDeprecated: current.filter((n) => n !== label.name) },
      });
    });

    await clearWorkspaceLabelsCache(workspaceId);
    emitToWorkspace(workspaceId, 'task:labels-changed', {
      taskId,
      labelId,
      action: 'unassigned' as const,
      by: userId,
    });
    return { ok: true };
  },

  async listForTask(workspaceId: string, taskId: string, userId: string) {
    await assertMembership(workspaceId, userId);
    const task = await prisma.task.findFirst({
      where: { id: taskId, workspaceId, deletedAt: null },
      select: { id: true },
    });
    if (!task) throw new NotFoundError('Task not found');
    const rows = await taskLabelRepo.listForTask(taskId);
    return rows.map((r) => r.label);
  },
};
