import { z } from 'zod';
import { cuidSchema } from './common';
import { CursorPaginationQuery } from './pagination';

export const updateWorkspaceNotificationSettingSchema = z.object({
  taskAssignedEmail: z.boolean().optional(),
  taskMentionedEmail: z.boolean().optional(),
  taskDueReminderEmail: z.boolean().optional(),
  taskDueReminderHours: z.number().int().min(1).max(168).optional(),
  commentReplyEmail: z.boolean().optional(),
  commentMentionEmail: z.boolean().optional(),
  dailyDigest: z.boolean().optional(),
  weeklyDigest: z.boolean().optional(),
});
export type UpdateWorkspaceNotificationSetting = z.infer<typeof updateWorkspaceNotificationSettingSchema>;

export const updateUserNotificationPreferenceSchema = z.object({
  workspaceId: z.string().nullable().optional(),
  taskAssignedEmail: z.boolean().nullable().optional(),
  taskMentionedEmail: z.boolean().nullable().optional(),
  taskDueReminderEmail: z.boolean().nullable().optional(),
  taskDueReminderHours: z.number().int().min(1).max(168).nullable().optional(),
  dailyDigest: z.boolean().nullable().optional(),
  weeklyDigest: z.boolean().nullable().optional(),
  emailDelayMinutes: z.number().int().min(0).max(60).optional(),
});
export type UpdateUserNotificationPreference = z.infer<typeof updateUserNotificationPreferenceSchema>;

export interface EffectivePreferences {
  taskAssignedEmail: boolean;
  taskMentionedEmail: boolean;
  taskDueReminderEmail: boolean;
  taskDueReminderHours: number;
  commentReplyEmail: boolean;
  commentMentionEmail: boolean;
  dailyDigest: boolean;
  weeklyDigest: boolean;
  emailDelayMinutes: number;
}

export const listEmailJobsQuerySchema = CursorPaginationQuery.extend({
  status: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
  type: z.enum(['INSTANT', 'DELAYED', 'DIGEST', 'DUE_REMINDER']).optional(),
  userId: cuidSchema.optional(),
});
export type ListEmailJobsQuery = z.infer<typeof listEmailJobsQuerySchema>;
