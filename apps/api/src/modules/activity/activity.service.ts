import { prisma } from '../../shared/lib/prisma';
import { assertMembership } from '../../shared/lib/access';
import { NotFoundError } from '../../shared/errors';
import * as repo from './activity.repository';
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
    return await repo.create(prisma, input);
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
