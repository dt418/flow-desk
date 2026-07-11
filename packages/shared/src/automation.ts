import { z } from 'zod';
import { cuidSchema } from './common';
import { activityActionEnumSchema } from './webhook';

export const ruleConditionSchema = z
  .object({
    field: z.string().min(1),
    op: z.enum(['eq', 'neq', 'in', 'contains']),
    value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
  })
  .nullable()
  .optional();
export type RuleCondition = z.infer<typeof ruleConditionSchema>;

export const ruleActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('set-field'),
    field: z.enum(['status', 'priority', 'title']),
    value: z.string(),
  }),
  z.object({
    type: z.literal('assign'),
    /** special: 'workspace-owner' or a userId */
    assigneeId: z.string().min(1),
  }),
  z.object({
    type: z.literal('move-column'),
    columnId: cuidSchema,
  }),
  z.object({
    type: z.literal('send-webhook'),
    url: z.string().url(),
  }),
  z.object({
    type: z.literal('send-email'),
    toUserId: cuidSchema,
    subject: z.string().min(1).max(200),
  }),
]);
export type RuleAction = z.infer<typeof ruleActionSchema>;

export const createAutomationRuleSchema = z.object({
  name: z.string().min(1).max(120),
  trigger: activityActionEnumSchema,
  condition: ruleConditionSchema,
  action: ruleActionSchema,
  isActive: z.boolean().default(true),
});
export type CreateAutomationRuleInput = z.infer<typeof createAutomationRuleSchema>;

export const updateAutomationRuleSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  trigger: activityActionEnumSchema.optional(),
  condition: ruleConditionSchema,
  action: ruleActionSchema.optional(),
  isActive: z.boolean().optional(),
});
export type UpdateAutomationRuleInput = z.infer<typeof updateAutomationRuleSchema>;

export const automationRuleSchema = z.object({
  id: cuidSchema,
  workspaceId: cuidSchema,
  name: z.string(),
  trigger: activityActionEnumSchema,
  condition: ruleConditionSchema,
  action: ruleActionSchema,
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});
export type AutomationRule = z.infer<typeof automationRuleSchema>;

export const automationRuleListSchema = z.object({
  data: z.array(automationRuleSchema),
});

export const ruleExecutionSchema = z.object({
  id: cuidSchema,
  ruleId: cuidSchema,
  activityId: cuidSchema,
  status: z.enum(['SUCCESS', 'FAILED', 'SKIPPED']),
  error: z.string().nullable(),
  executedAt: z.string(),
});
export type RuleExecution = z.infer<typeof ruleExecutionSchema>;
