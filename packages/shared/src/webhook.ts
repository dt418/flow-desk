import { z } from 'zod';
import { cuidSchema } from './common';
import { CursorPaginationQuery } from './pagination';

// Re-export the 16 ActivityAction values as a Zod enum for webhook event filtering.
// This matches the Prisma enum at schema.prisma:60 without importing @flowdesk/db.
export const activityActionEnumSchema = z.enum([
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
export type ActivityActionEnum = z.infer<typeof activityActionEnumSchema>;

// --- Webhook CRUD ---

export const createWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(activityActionEnumSchema).default([]),
  isActive: z.boolean().default(true),
});
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;

export const updateWebhookSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(activityActionEnumSchema).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;

export const webhookSchema = z.object({
  id: cuidSchema,
  workspaceId: cuidSchema,
  url: z.string(),
  events: z.array(activityActionEnumSchema),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});
export type Webhook = z.infer<typeof webhookSchema>;

// Create response includes secret once — never returned by list/get/patch.
export const webhookWithSecretSchema = webhookSchema.extend({ secret: z.string() });
export type WebhookWithSecret = z.infer<typeof webhookWithSecretSchema>;

export const webhookListResponseSchema = z.object({
  data: z.array(webhookSchema),
});
export type WebhookListResponse = z.infer<typeof webhookListResponseSchema>;

// --- WebhookDelivery ---

export const webhookDeliverySchema = z.object({
  id: cuidSchema,
  webhookId: cuidSchema,
  activityId: cuidSchema,
  status: z.enum(['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'ERROR']),
  attemptCount: z.number().int(),
  responseCode: z.number().int().nullable(),
  responseBody: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WebhookDelivery = z.infer<typeof webhookDeliverySchema>;

export const webhookDeliveryListResponseSchema = z.object({
  data: z.array(webhookDeliverySchema),
  nextCursor: z.string().nullable(),
});
export type WebhookDeliveryListResponse = z.infer<typeof webhookDeliveryListResponseSchema>;
