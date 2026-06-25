import { z } from 'zod';

export const LABEL_COLORS = [
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'gray',
] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];

export const labelColorSchema = z.enum(LABEL_COLORS);

export const labelSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string().min(1).max(50),
  color: labelColorSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createLabelSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-zA-Z0-9 _-]+$/, 'Only letters, digits, space, underscore, hyphen'),
  color: labelColorSchema,
});

export const updateLabelSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-zA-Z0-9 _-]+$/)
    .optional(),
  color: labelColorSchema.optional(),
});

export const assignLabelsSchema = z.object({
  labelIds: z.array(z.string()).max(50),
});

export type Label = z.infer<typeof labelSchema>;
export type CreateLabelInput = z.infer<typeof createLabelSchema>;
export type UpdateLabelInput = z.infer<typeof updateLabelSchema>;
export type AssignLabelsInput = z.infer<typeof assignLabelsSchema>;
