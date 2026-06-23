import { z } from 'zod';
import { cuidSchema, nonEmptyString } from './common';
import { CursorPaginationQuery } from './pagination';

export const createCommentSchema = z.object({
  taskId: cuidSchema,
  content: nonEmptyString,
  parentCommentId: cuidSchema.nullable().optional(),
  mentions: z.array(cuidSchema).max(20).optional(),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const updateCommentSchema = z.object({
  content: nonEmptyString,
});
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;

export const commentSchema = z.object({
  id: cuidSchema,
  taskId: cuidSchema,
  authorId: cuidSchema,
  parentCommentId: cuidSchema.nullable(),
  content: nonEmptyString,
  editedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});
export type Comment = z.infer<typeof commentSchema>;

export const commentWithAuthorSchema = commentSchema.extend({
  author: z.object({
    id: cuidSchema,
    name: z.string(),
    email: z.string().email(),
    avatarUrl: z.string().url().nullable(),
  }),
  _count: z
    .object({
      replies: z.number().int(),
    })
    .optional(),
});
export type CommentWithAuthor = z.infer<typeof commentWithAuthorSchema>;

export const listCommentsQuerySchema = CursorPaginationQuery.extend({
  taskId: cuidSchema,
});
export type ListCommentsQuery = z.infer<typeof listCommentsQuerySchema>;
