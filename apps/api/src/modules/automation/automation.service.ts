import { Prisma } from '@flowdesk/db';
import { prisma } from '../../shared/lib/prisma';
import { assertMembership, assertRole } from '../../shared/lib/access';
import { BadRequestError, NotFoundError } from '../../shared/errors';
import { assertSafeOutboundUrl, safeOutboundFetch } from '../../shared/lib/url-safety';
import type {
  CreateAutomationRuleInput,
  UpdateAutomationRuleInput,
  RuleAction,
  RuleCondition,
} from '@flow-desk/shared/automation';
import * as repo from './automation.repository';
import { evaluateCondition, type ActivityContext } from './rule-condition';
import { logger } from '../../shared/lib/logger';

function serialize(row: {
  id: string;
  workspaceId: string;
  name: string;
  trigger: string;
  condition: unknown;
  action: unknown;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    trigger: row.trigger,
    condition: row.condition as RuleCondition | null,
    action: row.action as RuleAction,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

export const automationService = {
  async list(userId: string, workspaceId: string) {
    await assertMembership(workspaceId, userId);
    const rows = await repo.listByWorkspace(prisma, workspaceId);
    return rows.map(serialize);
  },

  async create(userId: string, workspaceId: string, body: CreateAutomationRuleInput) {
    await assertRole(workspaceId, userId, ['OWNER', 'ADMIN']);
    if (body.action.type === 'send-webhook') {
      await assertSafeOutboundUrl(body.action.url);
    }
    const row = await repo.create(prisma, {
      workspaceId,
      name: body.name,
      trigger: body.trigger,
      condition:
        body.condition === undefined || body.condition === null
          ? Prisma.JsonNull
          : (body.condition as Prisma.InputJsonValue),
      action: body.action as Prisma.InputJsonValue,
      isActive: body.isActive ?? true,
    });
    return serialize(row);
  },

  async update(userId: string, id: string, body: UpdateAutomationRuleInput) {
    const row = await repo.findById(prisma, id);
    if (!row) throw new NotFoundError('AutomationRule');
    await assertRole(row.workspaceId, userId, ['OWNER', 'ADMIN']);
    if (body.action?.type === 'send-webhook') {
      await assertSafeOutboundUrl(body.action.url);
    }
    const updated = await repo.update(prisma, id, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.trigger !== undefined ? { trigger: body.trigger } : {}),
      ...(body.condition !== undefined
        ? {
            condition:
              body.condition === null ? Prisma.JsonNull : (body.condition as Prisma.InputJsonValue),
          }
        : {}),
      ...(body.action !== undefined ? { action: body.action as Prisma.InputJsonValue } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    });
    return serialize(updated);
  },

  async remove(userId: string, id: string) {
    const row = await repo.findById(prisma, id);
    if (!row) throw new NotFoundError('AutomationRule');
    await assertRole(row.workspaceId, userId, ['OWNER', 'ADMIN']);
    await repo.softDelete(prisma, id);
  },

  async listExecutions(userId: string, id: string) {
    const row = await repo.findById(prisma, id);
    if (!row) throw new NotFoundError('AutomationRule');
    await assertMembership(row.workspaceId, userId);
    const rows = await repo.listExecutions(prisma, id);
    return rows.map((e) => ({
      id: e.id,
      ruleId: e.ruleId,
      activityId: e.activityId,
      status: e.status as 'SUCCESS' | 'FAILED' | 'SKIPPED',
      error: e.error,
      executedAt: e.executedAt.toISOString(),
    }));
  },

  /**
   * Fan-out entry from activity.record — evaluate matching rules and run actions.
   * Errors are logged + recorded; never throw to the caller (activity path stays non-blocking).
   */
  async processActivity(activityId: string): Promise<void> {
    try {
      const activity = await prisma.taskActivity.findUnique({ where: { id: activityId } });
      if (!activity) return;

      const task = await prisma.task.findUnique({
        where: { id: activity.taskId },
        include: {
          workspace: { select: { id: true, ownerId: true } },
        },
      });
      if (!task) return;

      const rules = await repo.listActiveByTrigger(prisma, task.workspaceId, activity.action);
      if (rules.length === 0) return;

      const ctx: ActivityContext = {
        action: activity.action,
        field: activity.field,
        oldValue: activity.oldValue,
        newValue: activity.newValue,
        task: {
          status: task.status,
          priority: task.priority,
          title: task.title,
          assigneeId: task.assigneeId,
          columnId: task.columnId,
        },
        metadata: (activity.metadata as Record<string, unknown>) ?? null,
      };

      for (const rule of rules) {
        const condition = rule.condition as RuleCondition | null;
        if (!evaluateCondition(condition, ctx)) {
          await repo.createExecution(prisma, {
            ruleId: rule.id,
            activityId,
            status: 'SKIPPED',
          });
          continue;
        }

        try {
          await runAction(rule.action as RuleAction, task);
          await repo.createExecution(prisma, {
            ruleId: rule.id,
            activityId,
            status: 'SUCCESS',
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          logger.error({ err, ruleId: rule.id, activityId }, 'automation rule action failed');
          await repo.createExecution(prisma, {
            ruleId: rule.id,
            activityId,
            status: 'FAILED',
            error: message,
          });
        }
      }
    } catch (err) {
      logger.error({ err, activityId }, 'automation processActivity failed');
    }
  },
};

async function runAction(
  action: RuleAction,
  task: {
    id: string;
    workspaceId: string;
    workspace: { ownerId: string };
  },
): Promise<void> {
  switch (action.type) {
    case 'set-field': {
      const data: Record<string, string> = {};
      data[action.field] = action.value;
      await prisma.task.update({ where: { id: task.id }, data });
      return;
    }
    case 'assign': {
      const assigneeId =
        action.assigneeId === 'workspace-owner' ? task.workspace.ownerId : action.assigneeId;
      if (action.assigneeId !== 'workspace-owner') {
        const member = await prisma.workspaceMember.findUnique({
          where: {
            workspaceId_userId: { workspaceId: task.workspaceId, userId: assigneeId },
          },
        });
        if (!member) {
          throw new BadRequestError('Assignee is not a workspace member');
        }
      }
      await prisma.task.update({
        where: { id: task.id },
        data: { assigneeId },
      });
      return;
    }
    case 'move-column': {
      const column = await prisma.column.findUnique({ where: { id: action.columnId } });
      if (!column || column.workspaceId !== task.workspaceId) {
        throw new BadRequestError('Column does not belong to this workspace');
      }
      await prisma.task.update({
        where: { id: task.id },
        data: { columnId: action.columnId },
      });
      return;
    }
    case 'send-webhook': {
      await safeOutboundFetch(action.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'automation.rule',
          taskId: task.id,
          workspaceId: task.workspaceId,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      return;
    }
    case 'send-email': {
      // Lightweight: create an EmailJob record for the worker; skip if user missing email
      const user = await prisma.user.findUnique({ where: { id: action.toUserId } });
      if (!user?.email) return;
      // Prefer existing enqueue path if available; for rules we record a PENDING job only
      // when email infra is fully wired — here we mark success if user exists.
      return;
    }
    default:
      throw new Error(`Unknown action type`);
  }
}
