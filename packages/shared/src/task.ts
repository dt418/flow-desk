import { z } from 'zod';
import { cuidSchema, nameSchema, optionalString, paginationSchema, colorHexSchema } from './common';
import { CursorPaginationQuery } from './pagination';

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

export const taskTypeSchema = z.enum(['TASK', 'EPIC', 'STORY', 'SUBTASK']);
export type TaskType = z.infer<typeof taskTypeSchema>;

const isoDateSchema = z
  .union([z.string(), z.date()])
  .transform((v) => (v instanceof Date ? v.toISOString() : v));
const nullableIsoDateSchema = isoDateSchema.nullable();

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
  boardId: cuidSchema.nullable().optional(),
  type: taskTypeSchema.optional(),
  estimate: z.number().int().min(0).max(1000).nullable().optional(),
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
  estimate: z.number().int().min(0).max(1000).nullable().optional(),
  sprintId: cuidSchema.nullable().optional(),
  type: taskTypeSchema.optional(),
  parentTaskId: cuidSchema.nullable().optional(),
  boardId: cuidSchema.nullable().optional(),
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
  dueDate: nullableIsoDateSchema,
  completedAt: nullableIsoDateSchema,
  createdById: cuidSchema,
  version: z.number().int(),
  labels: z.array(z.string()),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
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
  boardId: cuidSchema.optional(),
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

export const restoreTaskSchema = z.object({});
export type RestoreTaskInput = z.infer<typeof restoreTaskSchema>;

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

export const activityActionSchema = z.enum([
  'CREATED',
  'TITLE_CHANGED',
  'DESCRIPTION_CHANGED',
  'STATUS_CHANGED',
  'PRIORITY_CHANGED',
  'COLUMN_CHANGED',
  'ASSIGNEE_CHANGED',
  'DUE_DATE_CHANGED',
  'MOVED',
  'RESTORED',
  'SUBTASK_CREATED',
  'DEPENDENCY_CREATED',
  'DEPENDENCY_DELETED',
  'COMMENT_ADDED',
  'LABEL_ADDED',
  'LABEL_REMOVED',
]);
export type ActivityAction = z.infer<typeof activityActionSchema>;

export const taskActivitySchema = z.object({
  id: cuidSchema,
  taskId: cuidSchema,
  userId: cuidSchema,
  action: activityActionSchema,
  field: z.string().nullable(),
  oldValue: z.string().nullable(),
  newValue: z.string().nullable(),
  metadata: z.unknown().nullable(),
  createdAt: z.string(),
});
export type TaskActivity = z.infer<typeof taskActivitySchema>;

export const taskActivityWithUserSchema = taskActivitySchema.extend({
  user: z.object({
    id: cuidSchema,
    name: z.string(),
    avatarUrl: z.string().nullable(),
  }),
});
export type TaskActivityWithUser = z.infer<typeof taskActivityWithUserSchema>;

export const listTaskActivityQuerySchema = CursorPaginationQuery;
export type ListTaskActivityQuery = z.infer<typeof listTaskActivityQuerySchema>;
