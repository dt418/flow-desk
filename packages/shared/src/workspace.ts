import { z } from 'zod';
import { nameSchema, slugSchema, colorHexSchema, cuidSchema, paginationSchema } from './common';
import { userRoleSchema } from './user';

export const workspaceVisibilitySchema = z.enum(['PRIVATE', 'PUBLIC']);
export type WorkspaceVisibility = z.infer<typeof workspaceVisibilitySchema>;

export const createWorkspaceSchema = z.object({
  name: nameSchema,
  slug: slugSchema,
  description: z.string().max(500).optional(),
  visibility: workspaceVisibilitySchema.default('PRIVATE'),
});
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

export const updateWorkspaceSchema = z.object({
  name: nameSchema.optional(),
  description: z.string().max(500).nullable().optional(),
  visibility: workspaceVisibilitySchema.optional(),
});
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;

export const workspaceSchema = z.object({
  id: cuidSchema,
  name: nameSchema,
  slug: slugSchema,
  description: z.string().nullable(),
  visibility: workspaceVisibilitySchema,
  ownerId: cuidSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});
export type Workspace = z.infer<typeof workspaceSchema>;

export const workspaceMemberSchema = z.object({
  id: cuidSchema,
  workspaceId: cuidSchema,
  userId: cuidSchema,
  role: userRoleSchema,
  joinedAt: z.string(),
  user: z
    .object({
      id: cuidSchema,
      email: z.string().email(),
      name: nameSchema,
      avatarUrl: z.string().url().nullable(),
    })
    .optional(),
});
export type WorkspaceMember = z.infer<typeof workspaceMemberSchema>;

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: userRoleSchema.default('MEMBER'),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const updateMemberSchema = z.object({
  role: userRoleSchema,
});
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

export const columnSchema = z.object({
  id: cuidSchema,
  workspaceId: cuidSchema,
  name: z.string().min(1).max(50),
  position: z.number().int().min(0),
  color: colorHexSchema.nullable(),
  isDoneColumn: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Column = z.infer<typeof columnSchema>;

export const createColumnSchema = z.object({
  name: z.string().min(1).max(50),
  position: z.number().int().min(0).optional(),
  color: colorHexSchema.nullable().optional(),
  isDoneColumn: z.boolean().optional(),
});
export type CreateColumnInput = z.infer<typeof createColumnSchema>;

export const updateColumnSchema = createColumnSchema.partial();
export type UpdateColumnInput = z.infer<typeof updateColumnSchema>;

export const listWorkspacesQuerySchema = paginationSchema.extend({
  search: z.string().max(100).optional(),
});
export type ListWorkspacesQuery = z.infer<typeof listWorkspacesQuerySchema>;
