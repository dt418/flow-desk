import { z } from 'zod';
import { cuidSchema } from './common';
import { taskPrioritySchema, taskStatusSchema } from './task';

// Matches the filter fields of listTasksQuerySchema (no pagination, no
// workspaceId — workspaceId is inferred from the URL path; saved views are
// filter sets, not page states).
export const savedFilterQuerySchema = z.object({
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assigneeId: cuidSchema.nullable().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'dueDate', 'priority', 'position']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});
export type SavedFilterQuery = z.infer<typeof savedFilterQuerySchema>;

export const savedFilterSchema = z.object({
  id: cuidSchema,
  userId: cuidSchema,
  workspaceId: cuidSchema,
  name: z.string().min(1).max(80),
  query: savedFilterQuerySchema,
  isShared: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SavedFilter = z.infer<typeof savedFilterSchema>;

export const createSavedFilterSchema = z.object({
  name: z.string().min(1).max(80).trim(),
  query: savedFilterQuerySchema,
  isShared: z.boolean().default(false),
});
export type CreateSavedFilterInput = z.infer<typeof createSavedFilterSchema>;

export const updateSavedFilterSchema = z.object({
  name: z.string().min(1).max(80).trim().optional(),
  query: savedFilterQuerySchema.optional(),
  isShared: z.boolean().optional(),
});
export type UpdateSavedFilterInput = z.infer<typeof updateSavedFilterSchema>;

export const savedFilterListResponseSchema = z.object({
  data: z.array(savedFilterSchema),
});
export type SavedFilterListResponse = z.infer<typeof savedFilterListResponseSchema>;
