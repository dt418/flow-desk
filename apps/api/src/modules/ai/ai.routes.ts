import { Hono } from 'hono';
import { z } from 'zod';
import type { UserRole } from '@prisma/client';
import { prisma } from '../../shared/lib/prisma';
import { requireAuth } from '../../shared/middleware/auth';
import { BadRequestError, NotFoundError } from '../../shared/errors';
import { llm } from '../../shared/lib/llm-provider';
import { logger } from '../../shared/lib/logger';

export const aiRouter = new Hono();
aiRouter.use('*', requireAuth());

const suggestSchema = z.object({
  workspaceId: z.string(),
  taskId: z.string().optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
});

aiRouter.post('/suggest-assignee', async (c) => {
  const auth = c.get('auth');
  const body = suggestSchema.parse(await c.req.json());

  let title = body.title;
  let description = body.description;
  if (body.taskId) {
    const task = await prisma.task.findUnique({ where: { id: body.taskId } });
    if (!task) throw new NotFoundError('Task not found');
    title = title ?? task.title;
    description = description ?? task.description ?? undefined;
  }
  if (!title) throw new BadRequestError('title or taskId required');

  const members: Array<{
    user: { id: string; name: string; email: string };
    role: UserRole;
  }> = await prisma.workspaceMember.findMany({
    where: { workspaceId: body.workspaceId },
    select: {
      role: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  const workload = await prisma.task.groupBy({
    by: ['assigneeId'],
    where: {
      workspaceId: body.workspaceId,
      deletedAt: null,
      status: { in: ['TODO', 'IN_PROGRESS', 'IN_REVIEW'] },
      assigneeId: { not: null },
    },
    _count: { _all: true },
  });
  const loadMap = new Map<string, number>(
    workload
      .filter((w: { assigneeId: string | null }) => w.assigneeId !== null)
      .map((w: { assigneeId: string | null; _count: { _all: number } }) => [
        w.assigneeId as string,
        w._count._all,
      ]),
  );

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
            candidates: members.map(
              (m: { user: { id: string; name: string; email: string }; role: UserRole }) => ({
                userId: m.user.id,
                name: m.user.name,
                email: m.user.email,
                role: m.role,
                activeTaskCount: loadMap.get(m.user.id) ?? 0,
              }),
            ),
          }),
        },
      ],
      { maxTokens: 600, temperature: 0.3 },
    );

    return c.json({
      suggestions: result.suggestions.slice(0, 3),
      fallback: false,
    });
  } catch (err) {
    logger.warn({ err }, 'LLM suggest-assignee failed, using rule-based fallback');
    const ranked = members
      .map((m: { user: { id: string; name: string } }) => {
        const load = loadMap.get(m.user.id) ?? 0;
        return { userId: m.user.id, name: m.user.name, activeTaskCount: load };
      })
      .sort(
        (a: { activeTaskCount: number }, b: { activeTaskCount: number }) =>
          a.activeTaskCount - b.activeTaskCount,
      )
      .slice(0, 3)
      .map((m: { userId: string; activeTaskCount: number }) => ({
        userId: m.userId,
        score: Math.max(40, 100 - m.activeTaskCount * 10),
        reason: `Lowest current workload (${m.activeTaskCount} active tasks)`,
      }));
    return c.json({ suggestions: ranked, fallback: true });
  }
});

const autoScheduleSchema = z.object({ workspaceId: z.string() });

type TaskWithDeps = Awaited<ReturnType<typeof loadTasks>>[number];

async function loadTasks(workspaceId: string) {
  return prisma.task.findMany({
    where: { workspaceId, deletedAt: null, status: { not: 'DONE' } },
    include: {
      dependencies: {
        include: {
          blockingTask: { select: { id: true, dueDate: true, status: true } },
        },
      },
    },
  });
}

aiRouter.post('/auto-schedule', async (c) => {
  const body = autoScheduleSchema.parse(await c.req.json());
  const tasks = await loadTasks(body.workspaceId);
  const sorted = topologicalSort(tasks);
  if (!sorted) throw new BadRequestError('Circular dependency detected');

  const capacity = new Map<string, number>();
  const schedule: Array<{ taskId: string; startDate: string; endDate: string }> = [];
  const day = 24 * 60 * 60 * 1000;

  for (const task of sorted) {
    const blockerDates = task.dependencies.map(
      (d: { blockingTask: { dueDate: Date | null } }) => d.blockingTask.dueDate?.getTime() ?? 0,
    );
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

  return c.json({ schedule });
});

function topologicalSort(tasks: TaskWithDeps[]): TaskWithDeps[] | null {
  const idMap = new Map(tasks.map((t) => [t.id, t]));
  const inDeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const t of tasks) {
    inDeg.set(t.id, 0);
    adj.set(t.id, []);
  }
  for (const t of tasks) {
    for (const dep of t.dependencies) {
      if (!idMap.has(dep.blockingTaskId)) continue;
      const list = adj.get(dep.blockingTaskId);
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
