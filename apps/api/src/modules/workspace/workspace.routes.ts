import { Hono } from 'hono';
import type { UserRole } from '@flowdesk/db';
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  inviteMemberSchema,
  updateMemberSchema,
  createColumnSchema,
  updateColumnSchema,
} from '@flow-desk/shared/workspace';
import { CursorPaginationQuery } from '@flow-desk/shared/pagination';
import { zValidator } from '@hono/zod-validator';
import { prisma } from '../../shared/lib/prisma';
import { requireAuth, requireWorkspaceRole } from '../../shared/middleware/auth';
import { rateLimit } from '../../shared/middleware/rate-limit';
import { RATE_LIMITS } from '../../shared/lib/rate-limit-policies';
import { NotFoundError, ForbiddenError, ConflictError } from '../../shared/errors';
import { workspaceService } from './workspace.service';
import { memberService } from './member.service';

export const workspaceRouter = new Hono();

workspaceRouter.use('*', requireAuth());

workspaceRouter.get(
  '/',
  rateLimit({ ...RATE_LIMITS.WORKSPACE_LIST, keyBy: 'user', scope: 'workspace:list' }),
  zValidator('query', CursorPaginationQuery, (result, c) => {
    if (!result.success) {
      return c.json({ code: 'INVALID_QUERY', details: result.error.flatten() }, 400);
    }
    return undefined;
  }),
  async (c) => {
    const auth = c.get('auth');
    const query = c.req.valid('query');
    const result = await workspaceService.list(query, auth.user.id);
    return c.json({ data: result.data, nextCursor: result.nextCursor });
  },
);

workspaceRouter.post(
  '/',
  rateLimit({ ...RATE_LIMITS.WORKSPACE_CREATE, keyBy: 'user', scope: 'workspace:create' }),
  async (c) => {
    const auth = c.get('auth');
    const body = createWorkspaceSchema.parse(await c.req.json());

    const slugTaken = await prisma.workspace.findUnique({ where: { slug: body.slug } });
    if (slugTaken) throw new ConflictError('Slug already taken');

    const workspace = await prisma.workspace.create({
      data: {
        name: body.name,
        slug: body.slug,
        description: body.description,
        visibility: body.visibility,
        ownerId: auth.user.id,
        members: { create: { userId: auth.user.id, role: 'OWNER' } },
        columns: {
          create: [
            { name: 'Backlog', position: 0, isDoneColumn: false },
            { name: 'Todo', position: 1, isDoneColumn: false },
            { name: 'In Progress', position: 2, isDoneColumn: false },
            { name: 'Done', position: 3, isDoneColumn: true },
          ],
        },
      },
    });
    return c.json({ workspace }, 201);
  },
);

workspaceRouter.get(
  '/:workspaceId',
  requireWorkspaceRole(['OWNER', 'ADMIN', 'MEMBER', 'GUEST']),
  async (c) => {
    const id = c.req.param('workspaceId')!;
    const workspace = await prisma.workspace.findFirst({
      where: { id, deletedAt: null },
      include: {
        columns: {
          orderBy: { position: 'asc' },
          include: { _count: { select: { tasks: { where: { deletedAt: null } } } } },
        },
      },
    });
    if (!workspace) throw new NotFoundError('Workspace not found');
    return c.json({ workspace });
  },
);

workspaceRouter.patch(
  '/:workspaceId',
  rateLimit({ ...RATE_LIMITS.WORKSPACE_UPDATE, keyBy: 'user', scope: 'workspace:update' }),
  requireWorkspaceRole(['OWNER', 'ADMIN']),
  async (c) => {
    const id = c.req.param('workspaceId')!;
    const auth = c.get('auth');
    const body = updateWorkspaceSchema.parse(await c.req.json());
    const existing = await prisma.workspace.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError('Workspace not found');
    const data: { name?: string; description?: string | null; visibility?: 'PRIVATE' | 'PUBLIC' } =
      {};
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description ?? undefined;
    if (body.visibility !== undefined) data.visibility = body.visibility;
    const updated = await prisma.workspace.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.visibility !== undefined ? { visibility: data.visibility } : {}),
      },
    });
    return c.json({ workspace: updated });
  },
);

workspaceRouter.delete(
  '/:workspaceId',
  rateLimit({ ...RATE_LIMITS.WORKSPACE_DELETE, keyBy: 'user', scope: 'workspace:delete' }),
  requireWorkspaceRole(['OWNER']),
  async (c) => {
    const id = c.req.param('workspaceId')!;
    await prisma.workspace.update({ where: { id }, data: { deletedAt: new Date() } });
    return c.json({ ok: true });
  },
);

workspaceRouter.get(
  '/:workspaceId/members',
  requireWorkspaceRole(['OWNER', 'ADMIN', 'MEMBER', 'GUEST']),
  zValidator('query', CursorPaginationQuery, (result, c) => {
    if (!result.success) {
      return c.json({ code: 'INVALID_QUERY', details: result.error.flatten() }, 400);
    }
    return undefined;
  }),
  async (c) => {
    const id = c.req.param('workspaceId')!;
    const auth = c.get('auth');
    const query = c.req.valid('query');
    const result = await memberService.list(query, id, auth.user.id);
    return c.json({ data: result.data, nextCursor: result.nextCursor });
  },
);

workspaceRouter.post(
  '/:workspaceId/members',
  requireWorkspaceRole(['OWNER', 'ADMIN']),
  rateLimit({ ...RATE_LIMITS.WORKSPACE_INVITE, keyBy: 'user', scope: 'workspace:invite' }),
  async (c) => {
    const id = c.req.param('workspaceId')!;
    const body = inviteMemberSchema.parse(await c.req.json());
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) throw new NotFoundError('User not registered');

    const existing = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: id, userId: user.id } },
    });
    if (existing) throw new ConflictError('User already a member');

    const member = await prisma.workspaceMember.create({
      data: { workspaceId: id, userId: user.id, role: body.role },
    });
    return c.json({ member }, 201);
  },
);

workspaceRouter.patch(
  '/:workspaceId/members/:userId',
  requireWorkspaceRole(['OWNER']),
  async (c) => {
    const id = c.req.param('workspaceId')!;
    const userId = c.req.param('userId')!;
    const body = updateMemberSchema.parse(await c.req.json());

    if (body.role !== 'OWNER') {
      const ownerCount = await prisma.workspaceMember.count({
        where: { workspaceId: id, role: 'OWNER' },
      });
      const target = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: id, userId } },
      });
      if (target?.role === 'OWNER' && ownerCount <= 1) {
        throw new ForbiddenError('Cannot demote the last owner');
      }
    }

    const member = await prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId: id, userId } },
      data: { role: body.role },
    });
    return c.json({ member });
  },
);

workspaceRouter.delete(
  '/:workspaceId/members/:userId',
  requireWorkspaceRole(['OWNER', 'ADMIN']),
  async (c) => {
    const id = c.req.param('workspaceId')!;
    const userId = c.req.param('userId')!;
    const target = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: id, userId } },
    });
    if (target?.role === 'OWNER') {
      const ownerCount = await prisma.workspaceMember.count({
        where: { workspaceId: id, role: 'OWNER' },
      });
      if (ownerCount <= 1) throw new ForbiddenError('Cannot remove the last owner');
    }
    await prisma.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId: id, userId } },
    });
    return c.json({ ok: true });
  },
);

workspaceRouter.post(
  '/:workspaceId/columns',
  requireWorkspaceRole(['OWNER', 'ADMIN']),
  async (c) => {
    const id = c.req.param('workspaceId')!;
    const body = createColumnSchema.parse(await c.req.json());
    const lastCol = await prisma.column.findFirst({
      where: { workspaceId: id },
      orderBy: { position: 'desc' },
    });
    const column = await prisma.column.create({
      data: {
        workspaceId: id,
        name: body.name,
        position: body.position ?? (lastCol ? lastCol.position + 1 : 0),
        color: body.color ?? null,
        isDoneColumn: body.isDoneColumn ?? false,
      },
    });
    return c.json({ column }, 201);
  },
);

workspaceRouter.patch(
  '/:workspaceId/columns/:columnId',
  requireWorkspaceRole(['OWNER', 'ADMIN']),
  async (c) => {
    const workspaceId = c.req.param('workspaceId')!;
    const columnId = c.req.param('columnId')!;
    const existing = await prisma.column.findUnique({
      where: { id: columnId },
      select: { workspaceId: true },
    });
    if (!existing || existing.workspaceId !== workspaceId) {
      throw new NotFoundError('Column');
    }
    const body = updateColumnSchema.parse(await c.req.json());
    const column = await prisma.column.update({ where: { id: columnId }, data: body });
    return c.json({ column });
  },
);

workspaceRouter.delete(
  '/:workspaceId/columns/:columnId',
  requireWorkspaceRole(['OWNER', 'ADMIN']),
  async (c) => {
    const workspaceId = c.req.param('workspaceId')!;
    const columnId = c.req.param('columnId')!;
    const existing = await prisma.column.findUnique({
      where: { id: columnId },
      select: { workspaceId: true },
    });
    if (!existing || existing.workspaceId !== workspaceId) {
      throw new NotFoundError('Column');
    }
    await prisma.column.delete({ where: { id: columnId } });
    return c.json({ ok: true });
  },
);
