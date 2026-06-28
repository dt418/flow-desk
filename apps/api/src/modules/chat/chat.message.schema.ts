import { z } from 'zod';
import { cuidSchema, nonEmptyString } from '@flow-desk/shared/common';

export const createChatMessageSchema = z.object({
  content: nonEmptyString.max(4000),
  mentionedUserIds: z.array(cuidSchema).max(20).default([]),
});
export type CreateChatMessageInput = z.infer<typeof createChatMessageSchema>;

export const updateChatMessageSchema = z.object({
  content: nonEmptyString.max(4000),
});
export type UpdateChatMessageInput = z.infer<typeof updateChatMessageSchema>;

export const listChatMessagesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListChatMessagesQuery = z.infer<typeof listChatMessagesQuerySchema>;

export const messageParamsSchema = z.object({
  wid: cuidSchema,
  channelId: cuidSchema,
  messageId: cuidSchema,
});
export type MessageParams = z.infer<typeof messageParamsSchema>;

export const chatMessageViewSchema = z.object({
  id: cuidSchema,
  channelId: cuidSchema,
  authorId: cuidSchema,
  content: z.string(),
  mentionedUserIds: z.array(cuidSchema),
  editedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ChatMessageView = z.infer<typeof chatMessageViewSchema>;
