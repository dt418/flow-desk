import { z } from 'zod';
import { cuidSchema } from './common';
import { CursorPaginationQuery } from './pagination';
import { notificationTypeSchema } from './notification';

export const digestCadenceSchema = z.enum(['NONE', 'DAILY', 'WEEKLY']);
export type DigestCadence = z.infer<typeof digestCadenceSchema>;

export const notificationChannelsSchema = z.object({
  inApp: z.boolean(),
  email: z.boolean(),
  push: z.boolean().default(false),
});
export type NotificationChannels = z.infer<typeof notificationChannelsSchema>;

export const notificationPreferencesSchema = z.object({
  types: z.record(notificationTypeSchema, notificationChannelsSchema),
});
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

export const updateWorkspaceDefaultSchema = z.object({
  defaults: notificationPreferencesSchema,
  digestCadence: digestCadenceSchema,
  digestHour: z.number().int().min(0).max(23),
});
export type UpdateWorkspaceDefaultInput = z.infer<typeof updateWorkspaceDefaultSchema>;

export const workspaceNotificationSettingViewSchema = z.object({
  workspaceId: cuidSchema,
  defaults: notificationPreferencesSchema,
  digestCadence: digestCadenceSchema,
  digestHour: z.number().int().min(0).max(23),
  updatedAt: z.string(),
});
export type WorkspaceNotificationSettingView = z.infer<typeof workspaceNotificationSettingViewSchema>;

export const upsertUserPreferenceSchema = z.object({
  workspaceId: cuidSchema,
  override: notificationPreferencesSchema.nullable(),
});
export type UpsertUserPreferenceInput = z.infer<typeof upsertUserPreferenceSchema>;

export const userNotificationPreferenceViewSchema = z.object({
  workspaceId: cuidSchema,
  userId: cuidSchema,
  override: notificationPreferencesSchema.nullable(),
  updatedAt: z.string(),
});
export type UserNotificationPreferenceView = z.infer<typeof userNotificationPreferenceViewSchema>;

export const effectivePreferencesViewSchema = z.object({
  workspaceId: cuidSchema,
  userId: cuidSchema,
  effective: notificationPreferencesSchema,
  source: z.record(notificationTypeSchema, z.enum(['USER', 'WORKSPACE'])),
});
export type EffectivePreferencesView = z.infer<typeof effectivePreferencesViewSchema>;

export const listEmailJobsQuerySchema = CursorPaginationQuery.extend({
  status: z.enum(['PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED']).optional(),
  type: z.enum(['INSTANT', 'DELAYED', 'DIGEST', 'DUE_REMINDER']).optional(),
  userId: cuidSchema.optional(),
});
export type ListEmailJobsQuery = z.infer<typeof listEmailJobsQuerySchema>;

export const emailJobViewSchema = z.object({
  id: cuidSchema,
  userId: cuidSchema,
  type: z.enum(['INSTANT', 'DELAYED', 'DIGEST', 'DUE_REMINDER']),
  status: z.enum(['PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED']),
  to: z.string().email(),
  subject: z.string(),
  attempt: z.number().int().min(0),
  scheduledAt: z.string(),
  sentAt: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type EmailJobView = z.infer<typeof emailJobViewSchema>;
