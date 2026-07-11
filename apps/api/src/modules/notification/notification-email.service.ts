import type { prisma } from '../../shared/lib/prisma';
import { getEffectivePreferences } from '../notification-preferences/notification-preferences.service';
import { enqueueEmail } from '../../workers/email/queue';
import { renderTaskAssignedEmail } from '../../shared/lib/email-templates/task-assigned';
import { renderTaskMentionEmail } from '../../shared/lib/email-templates/task-mention';
import { renderTaskStatusChangeEmail } from '../../shared/lib/email-templates/task-status-change';
import type { Prisma } from '@flowdesk/db';
type PrismaClient = typeof prisma;

async function enqueueTemplated(
  prisma: PrismaClient,
  opts: {
    userId: string;
    email: string;
    workspaceId: string;
    taskId: string;
    notificationType: string;
    subject: string;
    html: string;
    text: string;
    delayMs?: number;
  },
) {
  const jobId = opts.delayMs
    ? `delayed-${opts.userId}-${Date.now()}`
    : `instant-${opts.userId}-${Date.now()}`;

  await prisma.emailJob.create({
    data: {
      id: jobId,
      userId: opts.userId,
      type: opts.delayMs ? 'DELAYED' : 'INSTANT',
      payload: {
        taskId: opts.taskId,
        workspaceId: opts.workspaceId,
        notificationType: opts.notificationType,
      } as unknown as Prisma.JsonObject,
      status: 'PENDING',
      ...(opts.delayMs ? { scheduledAt: new Date(Date.now() + opts.delayMs) } : {}),
    },
  });

  await enqueueEmail(
    {
      userId: opts.userId,
      type: opts.delayMs ? 'DELAYED' : 'INSTANT',
      to: opts.email,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      metadata: {
        taskId: opts.taskId,
        workspaceId: opts.workspaceId,
        notificationType: opts.notificationType,
      },
    },
    { delay: opts.delayMs, jobId },
  );
}

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
  await enqueueTemplated(prisma, {
    userId: input.assigneeId,
    email: input.assigneeEmail,
    workspaceId: input.workspaceId,
    taskId: input.taskId,
    notificationType: 'TASK_ASSIGNED',
    subject: email.subject,
    html: email.html,
    text: email.text,
    delayMs,
  });
}

/** P2-2: @mention in comment → email when taskMentionedEmail is on. */
export async function handleTaskMentionEmail(
  prisma: PrismaClient,
  input: {
    recipientId: string;
    recipientName: string;
    recipientEmail: string;
    authorName: string;
    taskId: string;
    taskTitle: string;
    taskUrl: string;
    workspaceId: string;
    workspaceName: string;
    snippet: string;
  },
) {
  const prefs = await getEffectivePreferences(prisma, input.recipientId, input.workspaceId);
  if (!prefs.taskMentionedEmail) return;

  const email = renderTaskMentionEmail({
    recipientName: input.recipientName,
    authorName: input.authorName,
    taskTitle: input.taskTitle,
    taskUrl: input.taskUrl,
    workspaceName: input.workspaceName,
    snippet: input.snippet,
  });

  const delayMs = prefs.emailDelayMinutes > 0 ? prefs.emailDelayMinutes * 60 * 1000 : undefined;
  await enqueueTemplated(prisma, {
    userId: input.recipientId,
    email: input.recipientEmail,
    workspaceId: input.workspaceId,
    taskId: input.taskId,
    notificationType: 'TASK_MENTIONED',
    subject: email.subject,
    html: email.html,
    text: email.text,
    delayMs,
  });
}

/** P2-2: status change → email assignee when taskAssignedEmail is on (reuse assign toggle). */
export async function handleTaskStatusChangeEmail(
  prisma: PrismaClient,
  input: {
    recipientId: string;
    recipientName: string;
    recipientEmail: string;
    actorName: string;
    taskId: string;
    taskTitle: string;
    taskUrl: string;
    workspaceId: string;
    workspaceName: string;
    oldStatus: string;
    newStatus: string;
  },
) {
  const prefs = await getEffectivePreferences(prisma, input.recipientId, input.workspaceId);
  // Gated by taskAssignedEmail until a dedicated status toggle ships
  if (!prefs.taskAssignedEmail) return;

  const email = renderTaskStatusChangeEmail({
    recipientName: input.recipientName,
    actorName: input.actorName,
    taskTitle: input.taskTitle,
    taskUrl: input.taskUrl,
    workspaceName: input.workspaceName,
    oldStatus: input.oldStatus,
    newStatus: input.newStatus,
  });

  const delayMs = prefs.emailDelayMinutes > 0 ? prefs.emailDelayMinutes * 60 * 1000 : undefined;
  await enqueueTemplated(prisma, {
    userId: input.recipientId,
    email: input.recipientEmail,
    workspaceId: input.workspaceId,
    taskId: input.taskId,
    notificationType: 'STATUS_CHANGE',
    subject: email.subject,
    html: email.html,
    text: email.text,
    delayMs,
  });
}
