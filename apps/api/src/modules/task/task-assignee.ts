import { prisma } from '../../shared/lib/prisma';
import { logger } from '../../shared/lib/logger';
import { env } from '../../shared/lib/env';
import { emitToUser } from '../../shared/lib/socket-events';
import { createTaskAssignmentNotification } from '../notification/notification.service';
import { handleTaskAssignedEmail } from '../notification/notification-email.service';

export async function handleAssigneeChange(
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
    emitToUser(task.assigneeId!, 'notification:new', { notification });
  } catch (err) {
    logger.warn({ err, taskId: task.id }, 'failed to create assignment notification');
  }

  try {
    const appUrl = env.APP_URL;
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
