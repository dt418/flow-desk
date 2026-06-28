import { z } from 'zod';
import { cuidSchema } from '@flow-desk/shared/common';

export const workspaceParamSchema = z.object({
  workspaceId: cuidSchema,
});

export const listUserPrefsQuerySchema = z.object({
  workspaceId: cuidSchema.optional(),
});
export type ListUserPrefsQuery = z.infer<typeof listUserPrefsQuerySchema>;
