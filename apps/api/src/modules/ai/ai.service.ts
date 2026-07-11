import type { prisma } from '../../shared/lib/prisma';
type PrismaClient = typeof prisma;
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { BadRequestError, NotFoundError } from '../../shared/errors';
import { assertMembership } from '../../shared/lib/access';
import { llm } from '../../shared/lib/llm-provider';
import { logger } from '../../shared/lib/logger';
import { redis } from '../../shared/lib/redis';
import * as repo from './ai.repository';

const SUGGEST_CACHE_TTL_SECONDS = 300; // 5 min — same-input suggestion reuse

function suggestCacheKey(workspaceId: string, title: string, memberIds: string[]): string {
  // Cache key: workspace + title hash + sorted member-id set hash.
  // Member-set change is rare; title is the dominant input.
  const memberPart = memberIds.slice().sort().join(',');
  const titleHash = createHash('sha1').update(title).digest('hex').slice(0, 12);
  return `ai:suggest-assignee:${workspaceId}:${titleHash}:${memberPart}`;
}

/** Bust the cache prefix for a workspace. Call on WorkspaceMember add/remove. */
export async function invalidateSuggestAssigneeCache(workspaceId: string): Promise<void> {
  // Member-set hash varies per cache key, so we cannot prefix-delete; rely on TTL.
  // Document the limitation here so a future maintainer knows why this is a no-op.
  void workspaceId;
}

export const suggestAssigneeSchema = z.object({
  workspaceId: z.string(),
  taskId: z.string().optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
});
export type SuggestAssigneeInput = z.infer<typeof suggestAssigneeSchema>;

export const autoScheduleSchema = z.object({ workspaceId: z.string() });
export type AutoScheduleInput = z.infer<typeof autoScheduleSchema>;

type TaskWithDeps = Awaited<ReturnType<typeof repo.listOpenTasksForSchedule>>[number];

export async function suggestAssignee(
  prisma: PrismaClient,
  userId: string,
  input: SuggestAssigneeInput,
) {
  await assertMembership(input.workspaceId, userId);

  let title = input.title;
  let description = input.description;
  if (input.taskId) {
    const task = await repo.findTask(prisma, input.taskId, input.workspaceId);
    if (!task) throw new NotFoundError('Task not found');
    title = title ?? task.title;
    description = description ?? task.description ?? undefined;
  }
  if (!title) throw new BadRequestError('title or taskId required');

  const members = await repo.listMembers(prisma, input.workspaceId);
  const workload = await repo.groupWorkload(prisma, input.workspaceId);
  const loadMap = new Map<string, number>(
    workload
      .filter((w) => w.assigneeId !== null)
      .map((w) => [w.assigneeId as string, w._count._all]),
  );

  // Cache lookup — same (title, member-set) within 5 min returns the cached
  // suggestions without re-asking the LLM.
  const cacheKey = suggestCacheKey(
    input.workspaceId,
    title,
    members.map((m) => m.user.id),
  );
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      logger.debug({ cacheKey }, 'suggestAssignee cache hit');
      return { suggestions: JSON.parse(cached), fallback: false };
    }
  } catch (err) {
    logger.warn({ err }, 'suggestAssignee cache read failed');
  }

  try {
    const result = await llm.chatJSON<{
      suggestions: Array<{ userId: string; score: number; reason: string }>;
    }>(
      [
        {
          role: 'system',
          content:
            'You are a task assignment recommender. Given a task and a list of workspace members with current workload, return a JSON object with `suggestions` array, ranked by best fit. Include userId, score (0-100), and a one-sentence reason. Max 3 suggestions.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            task: { title, description },
            candidates: members.map((m) => ({
              userId: m.user.id,
              name: m.user.name,
              email: m.user.email,
              role: m.role,
              activeTaskCount: loadMap.get(m.user.id) ?? 0,
            })),
          }),
        },
      ],
      { maxTokens: 600, temperature: 0.3 },
    );

    const suggestions = result.suggestions.slice(0, 3);
    // Cache write — best-effort, do not fail the request.
    redis
      .set(cacheKey, JSON.stringify(suggestions), 'EX', SUGGEST_CACHE_TTL_SECONDS)
      .catch((err) => logger.warn({ err }, 'suggestAssignee cache write failed'));
    return { suggestions, fallback: false };
  } catch (err) {
    logger.warn({ err }, 'LLM suggest-assignee failed, using rule-based fallback');
    const ranked = members
      .map((m) => {
        const load = loadMap.get(m.user.id) ?? 0;
        return { userId: m.user.id, name: m.user.name, activeTaskCount: load };
      })
      .sort((a, b) => a.activeTaskCount - b.activeTaskCount)
      .slice(0, 3)
      .map((m) => ({
        userId: m.userId,
        score: Math.max(40, 100 - m.activeTaskCount * 10),
        reason: `Lowest current workload (${m.activeTaskCount} active tasks)`,
      }));
    return { suggestions: ranked, fallback: true };
  }
}

export async function autoSchedule(prisma: PrismaClient, userId: string, input: AutoScheduleInput) {
  await assertMembership(input.workspaceId, userId);
  const tasks = await repo.listOpenTasksForSchedule(prisma, input.workspaceId);
  const sorted = topologicalSort(tasks);
  if (!sorted) throw new BadRequestError('Circular dependency detected');

  const capacity = new Map<string, number>();
  const schedule: Array<{ taskId: string; startDate: string; endDate: string }> = [];
  const day = 24 * 60 * 60 * 1000;

  for (const task of sorted) {
    const blockerDates = task.blockers.map((d) => d.blockingTask.dueDate?.getTime() ?? 0);
    const earliestStart = blockerDates.length > 0 ? Math.max(...blockerDates) + day : Date.now();
    const dueMs = task.dueDate ? task.dueDate.getTime() : earliestStart + 3 * day;
    const userLoad = capacity.get(task.assigneeId ?? 'unassigned') ?? 0;
    const start = Math.max(earliestStart, Date.now() + userLoad * day);
    const end = Math.min(start + 2 * day, dueMs);
    schedule.push({
      taskId: task.id,
      startDate: new Date(start).toISOString(),
      endDate: new Date(end).toISOString(),
    });
    capacity.set(task.assigneeId ?? 'unassigned', userLoad + 1);
  }

  return { schedule };
}

function topologicalSort(tasks: TaskWithDeps[]): TaskWithDeps[] | null {
  const idMap = new Map(tasks.map((t) => [t.id, t]));
  const inDeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const t of tasks) {
    inDeg.set(t.id, 0);
    adj.set(t.id, []);
  }
  for (const t of tasks) {
    for (const blocker of t.blockers) {
      if (!idMap.has(blocker.blockingTaskId)) continue;
      const list = adj.get(blocker.blockingTaskId);
      if (list) list.push(t.id);
      inDeg.set(t.id, (inDeg.get(t.id) ?? 0) + 1);
    }
  }
  const queue: string[] = [];
  for (const [id, deg] of inDeg) if (deg === 0) queue.push(id);
  const order: TaskWithDeps[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    const t = idMap.get(id);
    if (t) order.push(t);
    for (const next of adj.get(id) ?? []) {
      inDeg.set(next, (inDeg.get(next) ?? 0) - 1);
      if (inDeg.get(next) === 0) queue.push(next);
    }
  }
  return order.length === tasks.length ? order : null;
}
