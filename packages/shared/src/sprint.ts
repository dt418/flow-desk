import { z } from 'zod';
import { cuidSchema } from './common';

export const sprintStatusSchema = z.enum(['PLANNED', 'ACTIVE', 'CLOSED']);
export type SprintStatus = z.infer<typeof sprintStatusSchema>;

export const createSprintSchema = z.object({
  name: z.string().min(1).max(120),
  goal: z.string().max(500).optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});
export type CreateSprintInput = z.infer<typeof createSprintSchema>;

export const updateSprintSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  goal: z.string().max(500).nullable().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  status: sprintStatusSchema.optional(),
});
export type UpdateSprintInput = z.infer<typeof updateSprintSchema>;

export const sprintSchema = z.object({
  id: cuidSchema,
  workspaceId: cuidSchema,
  name: z.string(),
  goal: z.string().nullable(),
  startDate: z.string(),
  endDate: z.string(),
  status: sprintStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
  totalPoints: z.number().optional(),
  taskCount: z.number().optional(),
});
export type Sprint = z.infer<typeof sprintSchema>;

export const assignSprintTaskSchema = z.object({
  taskId: cuidSchema,
});

export const burndownPointSchema = z.object({
  date: z.string(),
  remaining: z.number(),
  ideal: z.number(),
});
export type BurndownPoint = z.infer<typeof burndownPointSchema>;
