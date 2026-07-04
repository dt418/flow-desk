import { z } from 'zod';
import { cuidSchema } from './common';

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(200).trim(),
  workspaceId: cuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(30).default(20),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const searchResultSchema = z.object({
  type: z.enum(['task', 'comment', 'attachment']),
  id: cuidSchema,
  workspaceId: cuidSchema,
  taskId: cuidSchema,
  title: z.string(),
  rank: z.number(),
});
export type SearchResult = z.infer<typeof searchResultSchema>;

export const searchResponseSchema = z.object({
  data: z.array(searchResultSchema),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;
