import { prisma } from '../../shared/lib/prisma';
import { logger } from '../../shared/lib/logger';
import { env } from '../../shared/lib/env';
import { activityService } from './index';
import { handleTaskStatusChangeEmail } from '../notification/notification-email.service';

export async function recordUpdateDiff(
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
    workspaceId: string;
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

  // P2-2: status-change email to assignee
  if (existing.status !== updated.status && updated.assigneeId) {
    try {
      const [workspace, assignee, actor] = await Promise.all([
        prisma.workspace.findUnique({
          where: { id: updated.workspaceId },
          select: { name: true },
        }),
        prisma.user.findUnique({
          where: { id: updated.assigneeId },
          select: { id: true, name: true, email: true },
        }),
        prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
      ]);
      if (workspace && assignee && actor) {
        const appUrl = env.APP_URL;
        await handleTaskStatusChangeEmail(prisma, {
          recipientId: assignee.id,
          recipientName: assignee.name,
          recipientEmail: assignee.email,
          actorName: actor.name,
          taskId: updated.id,
          taskTitle: updated.title,
          taskUrl: `${appUrl}/tasks/${updated.id}`,
          workspaceId: updated.workspaceId,
          workspaceName: workspace.name,
          oldStatus: existing.status,
          newStatus: updated.status,
        });
      }
    } catch (err) {
      logger.warn({ err, taskId: updated.id }, 'failed to enqueue status-change email');
    }
  }
}
