import { z } from 'zod';
import { cuidSchema } from './common';

export const MAX_UPLOAD_SIZE = 25 * 1024 * 1024;

export const attachmentTypeSchema = z.enum(['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'OTHER']);
export type AttachmentType = z.infer<typeof attachmentTypeSchema>;

export const attachmentSchema = z.object({
  id: cuidSchema,
  taskId: cuidSchema,
  uploadedById: cuidSchema,
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  size: z.number().int().min(0).max(MAX_UPLOAD_SIZE),
  type: attachmentTypeSchema,
  url: z.string().url(),
  thumbnailUrl: z.string().url().nullable(),
  createdAt: z.string(),
});
export type Attachment = z.infer<typeof attachmentSchema>;

export const listAttachmentsQuerySchema = z.object({
  taskId: cuidSchema,
});
export type ListAttachmentsQuery = z.infer<typeof listAttachmentsQuerySchema>;
