import { prisma } from '../../shared/lib/prisma';
import { assertMembership } from '../../shared/lib/access';
import { NotFoundError } from '../../shared/errors';
import * as repo from './activity.repository';
import * as webhookRepo from '../webhook/webhook.repository';
import { webhookQueue } from '../../workers/webhook/queue';
import { automationService } from '../automation/automation.service';
import type { ActivityAction } from '@flow-desk/shared/task';
import type { TaskActivity } from '@flowdesk/db';

export interface RecordInput {
  taskId: string;
  userId: string;
  action: ActivityAction;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  metadata?: unknown;
}

export async function record(input: RecordInput): Promise<TaskActivity | null> {
  try {
    const activity = await repo.create(prisma, input);

    // Fan-out to webhooks
    if (activity) {
      const task = await prisma.task.findUnique({
        where: { id: activity.taskId },
        select: { workspaceId: true },
      });

      if (task) {
        const webhooks = await webhookRepo.listActiveByWorkspace(prisma, task.workspaceId);

        for (const webhook of webhooks) {
          if (webhook.events.includes(activity.action)) {
            await webhookQueue.add('webhook', {
              webhookId: webhook.id,
              activityId: activity.id,
              webhookUrl: webhook.url,
              webhookSecret: webhook.secret,
              activity: {
                action: activity.action,
                field: activity.field ?? undefined,
                oldValue: activity.oldValue ?? undefined,
                newValue: activity.newValue ?? undefined,
                metadata: activity.metadata as Record<string, unknown>,
              },
            });
          }
        }
      }

      // Fan-out to automation rules (non-blocking for caller — errors swallowed inside)
      await automationService.processActivity(activity.id);
    }

    return activity;
  } catch {
    return null;
  }
}

export async function list(
  userId: string,
  taskId: string,
  query: { cursor?: string; limit: number },
): Promise<{ data: repo.TaskActivityWithUser[]; nextCursor: string | null }> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, deletedAt: null },
    select: { workspaceId: true },
  });
  if (!task) {
    throw new NotFoundError('Task');
  }
  await assertMembership(task.workspaceId, userId);
  return repo.listByTask(prisma, taskId, query);
}

export const activityService = { record, list };
