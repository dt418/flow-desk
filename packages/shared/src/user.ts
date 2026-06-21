import { z } from 'zod';
import { emailSchema, passwordSchema, nameSchema } from './common';

export const userRoleSchema = z.enum(['OWNER', 'ADMIN', 'MEMBER', 'GUEST']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const userPublicSchema = z.object({
  id: z.string(),
  email: emailSchema,
  name: nameSchema,
  avatarUrl: z.string().url().nullable(),
  createdAt: z.string(),
});
export type UserPublic = z.infer<typeof userPublicSchema>;

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const updateUserSchema = z.object({
  name: nameSchema.optional(),
  avatarUrl: z.string().url().nullable().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: passwordSchema,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password must differ from current password',
    path: ['newPassword'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
