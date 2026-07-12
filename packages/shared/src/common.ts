import { z } from 'zod';

export const emailSchema = z.string().email().max(255).toLowerCase();

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one digit');

export const nameSchema = z.string().min(1).max(100).trim();

export const slugSchema = z
  .string()
  .min(2)
  .max(50)
  .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens');

export const cuidSchema = z.string().min(20).max(30);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const idSchema = z.object({ id: cuidSchema });

export const isoDateString = z.string().datetime({ offset: true }).or(z.string().date());

export const nonEmptyString = z.string().min(1).max(10_000);

export const optionalString = z.string().max(10_000).nullable().optional();

export const urlSchema = z.string().url().max(2048);

export const colorHexSchema = z
  .string()
  .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid hex color');

export type Pagination = z.infer<typeof paginationSchema>;
