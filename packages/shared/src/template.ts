import { z } from 'zod';
import { cuidSchema } from './common';
import { taskPrioritySchema } from './task';

export const templateFieldsSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  priority: taskPrioritySchema.optional(),
  estimate: z.number().int().min(0).max(1000).optional(),
});
export type TemplateFields = z.infer<typeof templateFieldsSchema>;

export const createTemplateSchema = z.object({
  name: z.string().min(1).max(120),
  fields: templateFieldsSchema,
});
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const createRecurringSchema = z.object({
  templateId: cuidSchema,
  /** Simple cron: "0 9 * * 1" = Mon 09:00, or "daily", "weekly" aliases */
  cron: z.string().min(1).max(64),
  isActive: z.boolean().default(true),
});
export type CreateRecurringInput = z.infer<typeof createRecurringSchema>;

export const taskTemplateSchema = z.object({
  id: cuidSchema,
  workspaceId: cuidSchema,
  name: z.string(),
  fields: templateFieldsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});
