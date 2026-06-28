import type { prisma } from '../../shared/lib/prisma';
import { getEffectivePreferences } from '../notification-preferences/notification-preferences.service';
import { enqueueEmail } from '../../workers/email/queue';
import { renderTaskAssignedEmail } from '../../shared/lib/email-templates/task-assigned';
import type { Prisma } from '@flowdesk/db';
type PrismaClient = typeof prisma;

export async function handleTaskAssignedEmail(
  prisma: PrismaClient,
  input: {
    assigneeId: string;
    assigneeName: string;
    assigneeEmail: string;
    assignerName: string;
    taskId: string;
    taskTitle: string;
    taskUrl: string;
    workspaceId: string;
    workspaceName: string;
    dueAt: string | null;
  },
) {
  const prefs = await getEffectivePreferences(prisma, input.assigneeId, input.workspaceId);
  if (!prefs.taskAssignedEmail) return;

  const email = renderTaskAssignedEmail({
    assigneeName: input.assigneeName,
    assignerName: input.assignerName,
    taskTitle: input.taskTitle,
    taskId: input.taskId,
    taskUrl: input.taskUrl,
    workspaceName: input.workspaceName,
    dueAt: input.dueAt,
  });

  const delayMs = prefs.emailDelayMinutes > 0 ? prefs.emailDelayMinutes * 60 * 1000 : undefined;

  const jobId = delayMs ? `delayed-${input.assigneeId}-${Date.now()}` : `instant-${input.assigneeId}-${Date.now()}`;

  await prisma.emailJob.create({
    data: {
      id: jobId,
      userId: input.assigneeId,
      type: delayMs ? 'DELAYED' : 'INSTANT',
      payload: {
        taskId: input.taskId,
        workspaceId: input.workspaceId,
        notificationType: 'TASK_ASSIGNED',
      } as unknown as Prisma.JsonObject,
      status: delayMs ? 'PENDING' : 'SENT',
      ...(delayMs ? { scheduledAt: new Date(Date.now() + delayMs) } : {}),
    },
  });

  await enqueueEmail(
    {
      userId: input.assigneeId,
      type: delayMs ? 'DELAYED' : 'INSTANT',
      to: input.assigneeEmail,
      subject: email.subject,
      html: email.html,
      text: email.text,
      metadata: {
        taskId: input.taskId,
        workspaceId: input.workspaceId,
        notificationType: 'TASK_ASSIGNED',
      },
    },
    { delay: delayMs, jobId },
  );
}
