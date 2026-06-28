import { z } from 'zod';
import { cuidSchema } from '@flow-desk/shared/common';

export const createChannelSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(500).optional(),
  isPrivate: z.boolean().default(false),
});
export type CreateChannelInput = z.infer<typeof createChannelSchema>;

export const updateChannelSchema = z
  .object({
    name: z.string().min(2).max(80).optional(),
    description: z.string().max(500).optional(),
    isPrivate: z.boolean().optional(),
  })
  .refine(
    (v) => v.name !== undefined || v.description !== undefined || v.isPrivate !== undefined,
    { message: 'At least one field must be provided' },
  );
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;

export const channelParamSchema = z.object({
  wid: cuidSchema,
  id: cuidSchema,
});

export const listChannelsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
