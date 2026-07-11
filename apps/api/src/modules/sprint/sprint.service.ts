import { prisma } from '../../shared/lib/prisma';
import { assertMembership, assertRole } from '../../shared/lib/access';
import { BadRequestError, NotFoundError } from '../../shared/errors';
import type { CreateSprintInput, UpdateSprintInput } from '@flow-desk/shared/sprint';
import { computeBurndown } from './burndown';

function serialize(s: {
  id: string;
  workspaceId: string;
  name: string;
  goal: string | null;
  startDate: Date;
  endDate: Date;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}) {
  return {
    id: s.id,
    workspaceId: s.workspaceId,
    name: s.name,
    goal: s.goal,
    startDate: s.startDate.toISOString(),
    endDate: s.endDate.toISOString(),
    status: s.status as 'PLANNED' | 'ACTIVE' | 'CLOSED',
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    deletedAt: s.deletedAt?.toISOString() ?? null,
  };
}

export const sprintService = {
  async list(userId: string, workspaceId: string) {
    await assertMembership(workspaceId, userId);
    const rows = await prisma.sprint.findMany({
      where: { workspaceId },
      orderBy: { startDate: 'desc' },
    });
    const ids = rows.map((s) => s.id);
    const groups =
      ids.length > 0
        ? await prisma.task.groupBy({
            by: ['sprintId'],
            where: { sprintId: { in: ids }, deletedAt: null },
            _sum: { estimate: true },
            _count: { _all: true },
          })
        : [];
    const bySprint = new Map(groups.map((g) => [g.sprintId, g]));
    return rows.map((s) => {
      const g = bySprint.get(s.id);
      return {
        ...serialize(s),
        totalPoints: g?._sum.estimate ?? 0,
        taskCount: g?._count._all ?? 0,
      };
    });
  },

  async create(userId: string, workspaceId: string, body: CreateSprintInput) {
    await assertRole(workspaceId, userId, ['OWNER', 'ADMIN', 'MEMBER']);
    const start = new Date(body.startDate);
    const end = new Date(body.endDate);
    if (end <= start) throw new BadRequestError('endDate must be after startDate');
    const row = await prisma.sprint.create({
      data: {
        workspaceId,
        name: body.name,
        goal: body.goal ?? null,
        startDate: start,
        endDate: end,
      },
    });
    return serialize(row);
  },

  async update(userId: string, id: string, body: UpdateSprintInput) {
    const existing = await prisma.sprint.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw new NotFoundError('Sprint');
    await assertRole(existing.workspaceId, userId, ['OWNER', 'ADMIN', 'MEMBER']);
    const row = await prisma.sprint.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.goal !== undefined ? { goal: body.goal } : {}),
        ...(body.startDate !== undefined ? { startDate: new Date(body.startDate) } : {}),
        ...(body.endDate !== undefined ? { endDate: new Date(body.endDate) } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
      },
    });
    return serialize(row);
  },

  async remove(userId: string, id: string) {
    const existing = await prisma.sprint.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw new NotFoundError('Sprint');
    await assertRole(existing.workspaceId, userId, ['OWNER', 'ADMIN']);
    await prisma.sprint.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await prisma.task.updateMany({
      where: { sprintId: id },
      data: { sprintId: null },
    });
  },

  async assignTask(userId: string, sprintId: string, taskId: string) {
    const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
    if (!sprint || sprint.deletedAt) throw new NotFoundError('Sprint');
    await assertMembership(sprint.workspaceId, userId);
    const task = await prisma.task.findFirst({
      where: { id: taskId, workspaceId: sprint.workspaceId, deletedAt: null },
    });
    if (!task) throw new NotFoundError('Task');
    await prisma.task.update({ where: { id: taskId }, data: { sprintId } });
    return { ok: true };
  },

  async unassignTask(userId: string, sprintId: string, taskId: string) {
    const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
    if (!sprint || sprint.deletedAt) throw new NotFoundError('Sprint');
    await assertMembership(sprint.workspaceId, userId);
    await prisma.task.updateMany({
      where: { id: taskId, sprintId },
      data: { sprintId: null },
    });
    return { ok: true };
  },

  async burndown(userId: string, sprintId: string) {
    const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
    if (!sprint || sprint.deletedAt) throw new NotFoundError('Sprint');
    await assertMembership(sprint.workspaceId, userId);

    const tasks = await prisma.task.findMany({
      where: { sprintId, deletedAt: null },
      select: { estimate: true, completedAt: true, status: true },
    });
    const totalPoints = tasks.reduce((s, t) => s + (t.estimate ?? 0), 0);
    const completions = tasks
      .filter((t) => t.completedAt && (t.estimate ?? 0) > 0)
      .map((t) => ({ completedAt: t.completedAt!, points: t.estimate ?? 0 }));

    return computeBurndown({
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      totalPoints,
      completions,
    });
  },

  async backlog(userId: string, workspaceId: string) {
    await assertMembership(workspaceId, userId);
    return prisma.task.findMany({
      where: { workspaceId, sprintId: null, deletedAt: null },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        title: true,
        estimate: true,
        status: true,
        priority: true,
        assigneeId: true,
      },
    });
  },
};
