import { prisma } from '../../shared/lib/prisma';
import { assertMembership, assertRole } from '../../shared/lib/access';
import { NotFoundError, BadRequestError } from '../../shared/errors';
import type {
  CreateTemplateInput,
  CreateRecurringInput,
  TemplateFields,
} from '@flow-desk/shared/template';
import { nextRunAt } from './cron-next';
import { logger } from '../../shared/lib/logger';

function serializeTemplate(t: {
  id: string;
  workspaceId: string;
  name: string;
  fields: unknown;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}) {
  return {
    id: t.id,
    workspaceId: t.workspaceId,
    name: t.name,
    fields: t.fields as TemplateFields,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    deletedAt: t.deletedAt?.toISOString() ?? null,
  };
}

export const templateService = {
  async list(userId: string, workspaceId: string) {
    await assertMembership(workspaceId, userId);
    const rows = await prisma.taskTemplate.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(serializeTemplate);
  },

  async create(userId: string, workspaceId: string, body: CreateTemplateInput) {
    await assertRole(workspaceId, userId, ['OWNER', 'ADMIN', 'MEMBER']);
    const row = await prisma.taskTemplate.create({
      data: {
        workspaceId,
        name: body.name,
        fields: body.fields,
      },
    });
    return serializeTemplate(row);
  },

  async remove(userId: string, id: string) {
    const row = await prisma.taskTemplate.findUnique({ where: { id } });
    if (!row || row.deletedAt) throw new NotFoundError('TaskTemplate');
    await assertRole(row.workspaceId, userId, ['OWNER', 'ADMIN']);
    await prisma.taskTemplate.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  },

  async createRecurring(userId: string, workspaceId: string, body: CreateRecurringInput) {
    await assertRole(workspaceId, userId, ['OWNER', 'ADMIN', 'MEMBER']);
    const template = await prisma.taskTemplate.findFirst({
      where: { id: body.templateId, workspaceId, deletedAt: null },
    });
    if (!template) throw new NotFoundError('TaskTemplate');
    let next: Date;
    try {
      next = nextRunAt(body.cron);
    } catch (e) {
      throw new BadRequestError(e instanceof Error ? e.message : 'Invalid cron');
    }
    const row = await prisma.recurringRule.create({
      data: {
        templateId: body.templateId,
        cron: body.cron,
        nextRunAt: next,
        isActive: body.isActive ?? true,
      },
    });
    return {
      id: row.id,
      templateId: row.templateId,
      cron: row.cron,
      nextRunAt: row.nextRunAt.toISOString(),
      lastRunAt: row.lastRunAt?.toISOString() ?? null,
      isActive: row.isActive,
    };
  },

  async listRecurring(userId: string, workspaceId: string) {
    await assertMembership(workspaceId, userId);
    const templates = await prisma.taskTemplate.findMany({
      where: { workspaceId, deletedAt: null },
      select: { id: true },
    });
    const ids = templates.map((t) => t.id);
    const rows = await prisma.recurringRule.findMany({
      where: { templateId: { in: ids } },
      orderBy: { nextRunAt: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      templateId: r.templateId,
      cron: r.cron,
      nextRunAt: r.nextRunAt.toISOString(),
      lastRunAt: r.lastRunAt?.toISOString() ?? null,
      isActive: r.isActive,
    }));
  },

  /** Process due recurring rules — create tasks from templates. */
  async processDue(now: Date = new Date()): Promise<number> {
    const due = await prisma.recurringRule.findMany({
      where: { isActive: true, nextRunAt: { lte: now } },
      include: { template: true },
      take: 50,
    });
    let created = 0;
    for (const rule of due) {
      try {
        if (rule.template.deletedAt) continue;
        const fields = rule.template.fields as TemplateFields;
        const column = await prisma.column.findFirst({
          where: { workspaceId: rule.template.workspaceId },
          orderBy: { position: 'asc' },
        });
        if (!column) continue;
        const owner = await prisma.workspace.findUnique({
          where: { id: rule.template.workspaceId },
          select: { ownerId: true },
        });
        if (!owner) continue;

        await prisma.task.create({
          data: {
            workspaceId: rule.template.workspaceId,
            columnId: column.id,
            title: fields.title,
            description: fields.description ?? null,
            priority: fields.priority ?? 'MEDIUM',
            estimate: fields.estimate ?? null,
            createdById: owner.ownerId,
          },
        });
        created += 1;

        const next = nextRunAt(rule.cron, now);
        await prisma.recurringRule.update({
          where: { id: rule.id },
          data: { lastRunAt: now, nextRunAt: next },
        });
      } catch (err) {
        logger.error({ err, ruleId: rule.id }, 'recurring rule failed');
      }
    }
    return created;
  },
};
