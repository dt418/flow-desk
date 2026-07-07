import { z } from 'zod';

export const joinWorkspaceSchema = z.object({
  workspaceId: z.string().min(1),
});

export const leaveWorkspaceSchema = z.object({
  workspaceId: z.string().min(1),
});

export const joinTaskSchema = z.object({
  taskId: z.string().min(1),
});

export const leaveTaskSchema = z.object({
  taskId: z.string().min(1),
});

export const presenceJoinSchema = z.object({
  workspaceId: z.string().min(1),
});

export const presenceHeartbeatSchema = z.object({
  workspaceId: z.string().min(1),
});

export const presenceLeaveSchema = z.object({
  workspaceId: z.string().min(1),
});

export const conversationJoinSchema = z.object({
  channelId: z.string().min(1),
});

export const conversationLeaveSchema = z.object({
  channelId: z.string().min(1),
});

export const messageSendSchema = z.object({
  channelId: z.string().min(1),
  content: z.string().min(1).max(4000),
  clientMessageId: z.string().min(1).max(64),
  mentionedUserIds: z.array(z.string()).default([]),
});

export const messageReadSchema = z.object({
  workspaceId: z.string().min(1),
  channelId: z.string().min(1),
  messageId: z.string().min(1),
});

export const typingStartSchema = z.object({
  channelId: z.string().min(1),
});

export const typingStopSchema = z.object({
  channelId: z.string().min(1),
});
