import { z } from 'zod';
import { taskSchema } from '@flow-desk/shared/task';

export const taskResponseSchema = z.object({ task: taskSchema });
export type TaskResponse = z.infer<typeof taskResponseSchema>;

export const okResponseSchema = z.object({ ok: z.boolean() });
export type OkResponse = z.infer<typeof okResponseSchema>;

export const boardColumnSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: z.number(),
  isDoneColumn: z.boolean(),
  tasks: z.array(
    z.object({
      id: z.string(),
      columnId: z.string(),
      position: z.number(),
      version: z.number(),
      title: z.string(),
      status: z.string(),
      priority: z.string(),
    }),
  ),
});

export const boardResponseSchema = z.object({ columns: z.array(boardColumnSchema) });
export type BoardResponse = z.infer<typeof boardResponseSchema>;
