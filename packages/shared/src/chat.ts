import { z } from 'zod';
import { cuidSchema, nonEmptyString } from './common';
import { CursorPaginationQuery } from './pagination';

// Channel type (workspace channelizes by default; task channels wrap isChat comments)
export const channelScopeSchema = z.enum(['WORKSPACE', 'TASK']);
export type ChannelScope = z.infer<typeof channelScopeSchema>;

// Create channel
export const createChannelSchema = z
  .object({
    workspaceId: cuidSchema,
    name: z
      .string()
      .min(2)
      .max(80)
      .regex(/^[\w-]+$/), // allow letters, digits, _, -
    description: z.string().max(500).optional(),
    isPrivate: z.boolean().default(false),
    scope: channelScopeSchema.default('WORKSPACE'),
    taskId: cuidSchema.optional(), // required when scope=TASK
  })
  .refine((v) => v.scope === 'WORKSPACE' || !!v.taskId, {
    message: 'taskId required when scope=TASK',
    path: ['taskId'],
  });
export type CreateChannelInput = z.infer<typeof createChannelSchema>;

export const updateChannelSchema = z
  .object({
    name: z
      .string()
      .min(2)
      .max(80)
      .regex(/^[\w-]+$/)
      .optional(),
    description: z.string().max(500).optional(),
    isPrivate: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.description !== undefined || v.isPrivate !== undefined, {
    message: 'At least one field must be provided',
  });
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;

// Outputs
export const channelViewSchema = z.object({
  id: cuidSchema,
  workspaceId: cuidSchema,
  scope: channelScopeSchema,
  taskId: cuidSchema.nullable(),
  name: z.string(),
  description: z.string().nullable(),
  isPrivate: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ChannelView = z.infer<typeof channelViewSchema>;

export const channelWithLatestSchema = channelViewSchema.extend({
  latestMessage: z
    .object({
      id: cuidSchema,
      authorId: cuidSchema,
      content: z.string(),
      createdAt: z.string(),
    })
    .nullable(),
});
export type ChannelWithLatest = z.infer<typeof channelWithLatestSchema>;

// Messages
export const createChatMessageSchema = z.object({
  channelId: cuidSchema,
  content: nonEmptyString,
  mentionedUserIds: z.array(cuidSchema).max(20).default([]),
  clientMessageId: z.string().min(1).max(64),
});
export type CreateChatMessageInput = z.infer<typeof createChatMessageSchema>;

export const updateChatMessageSchema = z.object({
  content: nonEmptyString,
});
export type UpdateChatMessageInput = z.infer<typeof updateChatMessageSchema>;

export const chatMessageViewSchema = z.object({
  id: cuidSchema,
  channelId: cuidSchema,
  authorId: cuidSchema,
  content: z.string(),
  mentionedUserIds: z.array(cuidSchema),
  clientMessageId: z.string().optional(),
  editedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ChatMessageView = z.infer<typeof chatMessageViewSchema>;

export const chatMessageWithAuthorSchema = chatMessageViewSchema.extend({
  author: z.object({
    id: cuidSchema,
    name: z.string(),
    email: z.string().email(),
    avatarUrl: z.string().url().nullable(),
  }),
});
export type ChatMessageWithAuthor = z.infer<typeof chatMessageWithAuthorSchema>;

// List queries
export const listChannelsQuerySchema = CursorPaginationQuery.extend({
  workspaceId: cuidSchema,
  scope: channelScopeSchema.optional(),
});
export type ListChannelsQuery = z.infer<typeof listChannelsQuerySchema>;

export const listChatMessagesQuerySchema = CursorPaginationQuery.extend({
  channelId: cuidSchema,
});
export type ListChatMessagesQuery = z.infer<typeof listChatMessagesQuerySchema>;
