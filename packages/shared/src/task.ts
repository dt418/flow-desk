import { z } from 'zod';
import {
  cuidSchema,
  nameSchema,
  optionalString,
  nonEmptyString,
  paginationSchema,
  colorHexSchema,
} from './common';

export const taskPrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

export const taskStatusSchema = z.enum([
  'BACKLOG',
  'TODO',
  'IN_PROGRESS',
  'IN_REVIEW',
  'DONE',
  'BLOCKED',
]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const createTaskSchema = z.object({
  workspaceId: cuidSchema,
  columnId: cuidSchema,
  title: nameSchema,
  description: optionalString,
  priority: taskPrioritySchema.default('MEDIUM'),
  status: taskStatusSchema.default('TODO'),
  assigneeId: cuidSchema.nullable().optional(),
  dueDate: z.string().datetime({ offset: true }).nullable().optional(),
  parentTaskId: cuidSchema.nullable().optional(),
  position: z.number().int().min(0).optional(),
  labels: z.array(z.string().min(1).max(30)).max(20).optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z.object({
  title: nameSchema.optional(),
  description: optionalString,
  columnId: cuidSchema.optional(),
  priority: taskPrioritySchema.optional(),
  status: taskStatusSchema.optional(),
  assigneeId: cuidSchema.nullable().optional(),
  dueDate: z.string().datetime({ offset: true }).nullable().optional(),
  position: z.number().int().min(0).optional(),
  labels: z.array(z.string().min(1).max(30)).max(20).optional(),
  version: z.number().int().min(0).optional(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const taskSchema = z.object({
  id: cuidSchema,
  workspaceId: cuidSchema,
  columnId: cuidSchema,
  parentTaskId: cuidSchema.nullable(),
  title: nameSchema,
  description: z.string().nullable(),
  priority: taskPrioritySchema,
  status: taskStatusSchema,
  position: z.number().int(),
  assigneeId: cuidSchema.nullable(),
  dueDate: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdById: cuidSchema,
  version: z.number().int(),
  labels: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});
export type Task = z.infer<typeof taskSchema>;

export const taskWithRelationsSchema = taskSchema.extend({
  assignee: z
    .object({
      id: cuidSchema,
      name: nameSchema,
      email: z.string().email(),
      avatarUrl: z.string().url().nullable(),
    })
    .nullable()
    .optional(),
  createdBy: z
    .object({
      id: cuidSchema,
      name: nameSchema,
      email: z.string().email(),
      avatarUrl: z.string().url().nullable(),
    })
    .optional(),
  subtasks: z.array(taskSchema).optional(),
  dependencies: z
    .array(
      z.object({
        id: cuidSchema,
        blockingTaskId: cuidSchema,
        blockedTaskId: cuidSchema,
        createdAt: z.string(),
      }),
    )
    .optional(),
  blockers: z
    .array(
      z.object({
        id: cuidSchema,
        blockingTaskId: cuidSchema,
        blockedTaskId: cuidSchema,
        createdAt: z.string(),
      }),
    )
    .optional(),
  _count: z
    .object({
      comments: z.number().int(),
      attachments: z.number().int(),
      subtasks: z.number().int(),
    })
    .optional(),
});
export type TaskWithRelations = z.infer<typeof taskWithRelationsSchema>;

export const listTasksQuerySchema = paginationSchema.extend({
  workspaceId: cuidSchema,
  columnId: cuidSchema.optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assigneeId: cuidSchema.optional(),
  search: z.string().max(200).optional(),
  dueBefore: z.string().datetime({ offset: true }).optional(),
  dueAfter: z.string().datetime({ offset: true }).optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'dueDate', 'priority', 'position']).default('position'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;

export const moveTaskSchema = z.object({
  columnId: cuidSchema,
  position: z.number().int().min(0),
  version: z.number().int().min(0),
});
export type MoveTaskInput = z.infer<typeof moveTaskSchema>;

export const createDependencySchema = z.object({
  blockingTaskId: cuidSchema,
  blockedTaskId: cuidSchema,
});
export type CreateDependencyInput = z.infer<typeof createDependencySchema>;

export const createSubtaskSchema = createTaskSchema.omit({ parentTaskId: true }).extend({
  parentTaskId: cuidSchema.optional(),
});
export type CreateSubtaskInput = z.infer<typeof createSubtaskSchema>;

export const taskLabelSchema = z.object({
  id: cuidSchema,
  workspaceId: cuidSchema,
  name: z.string().min(1).max(30),
  color: colorHexSchema,
  createdAt: z.string(),
});
export type TaskLabel = z.infer<typeof taskLabelSchema>;

export const createTaskLabelSchema = z.object({
  name: z.string().min(1).max(30),
  color: colorHexSchema,
});
export type CreateTaskLabelInput = z.infer<typeof createTaskLabelSchema>;

export const taskMentionSchema = z.object({
  userId: cuidSchema,
  username: z.string(),
  startIndex: z.number().int().min(0),
  endIndex: z.number().int().min(0),
});
export type TaskMention = z.infer<typeof taskMentionSchema>;

export const TASK_LABELS_MAX = 20;
export const TASK_TITLE_MAX = 100;
export const TASK_DESCRIPTION_MAX = 10_000;
