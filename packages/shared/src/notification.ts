import { z } from 'zod';
import { cuidSchema } from './common';
import { CursorPaginationQuery } from './pagination';

export const notificationTypeSchema = z.enum([
  'TASK_ASSIGNED',
  'TASK_MENTIONED',
  'TASK_DUE_SOON',
  'TASK_OVERDUE',
  'TASK_COMPLETED',
  'COMMENT_REPLY',
  'WORKSPACE_INVITE',
  'WORKSPACE_ROLE_CHANGED',
]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

export const notificationSchema = z.object({
  id: cuidSchema,
  userId: cuidSchema,
  type: notificationTypeSchema,
  title: z.string().min(1).max(200),
  body: z.string().max(1000),
  data: z.record(z.unknown()).nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof notificationSchema>;

export const listNotificationsQuerySchema = CursorPaginationQuery.extend({
  unreadOnly: z.coerce.boolean().default(false),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

export const markReadSchema = z.object({
  ids: z.array(cuidSchema).min(1).max(100),
});
export type MarkReadInput = z.infer<typeof markReadSchema>;
